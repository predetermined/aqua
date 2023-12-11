import { serve } from "https://deno.land/std@0.185.0/http/server.ts";
import { Branch } from "./branch.ts";
import { Event, InternalizedEvent } from "./event.ts";
import { Method } from "./method.ts";

export type AquaOptionsCustomListenFn = ({
  handlerFn,
  abortSignal,
}: {
  handlerFn: (request: Request) => Response | Promise<Response>;
  abortSignal: AbortSignal;
}) => void | Promise<void>;

export interface AquaOptions {
  /**
   * `listen` either takes options that will be passed
   * to the std/http `serve` function, or a custom function
   * that starts the listening process and makes use of
   * Aqua's request handler function.
   *
   * @example
   * {
   *   port: 80
   * }
   *
   * @example
   * // `abortSignal` ignored for the sake of simplicity
   * async ({ handlerFn, abortSignal }) => {
   *   const conn = Deno.listen({ port: 80 });
   *   const httpConn = Deno.serveHttp(await conn.accept());
   *   const e = await httpConn.nextRequest();
   *   if (e) e.respondWith(await handlerFn(e.request));
   * }
   */
  listen?:
    | {
        port?: number;
        hostname?: string;
      }
    | AquaOptionsCustomListenFn;
  /**
   * @default false
   */
  shouldRepectTrailingSlash?: boolean;
}

export type StepFn<_Event extends Event> = (
  event: _Event
) => _Event | void | Promise<_Event | void>;

export type RespondFn<_Event extends Event> = (
  event: _Event
) => _Event["response"] | Promise<_Event["response"]>;

export interface RouteOptions<_Event extends Event> {
  steps?: StepFn<_Event>[];
}

interface AquaInternals<_Event extends Event> {
  options: AquaOptions;
  setRoute<__Event extends _Event>(
    method: Method,
    path: string,
    steps: StepFn<__Event>[]
  ): void;
}

const URL_PATTERN_PREFIX = "http://0.0.0.0";

export function getDefaultResponse() {
  return new Response("Not found.", { status: 404 });
}

export class Aqua<_Event extends Event = Event> {
  private abortController: AbortController;

  protected routes: Record<
    string,
    {
      path: string;
      urlPattern: URLPattern;
      // @todo Solve this `any` situation
      steps: StepFn<any>[];
    }
  > = {};

  public _internal: AquaInternals<_Event>;

  constructor(options: AquaOptions = {}) {
    this._internal = {
      options,
      setRoute: <__Event extends _Event>(
        method: Method,
        path: string,
        steps: StepFn<__Event>[]
      ) => {
        this.routes[method + path] = {
          path,
          urlPattern: new URLPattern(URL_PATTERN_PREFIX + path),
          steps,
        };
      },
    };
    this.abortController = new AbortController();

    this.listen(options?.listen);
  }

  protected async listen(listen: AquaOptions["listen"]) {
    const handlerFn = async (request: Request) => {
      try {
        return await this.handleRequest(this.createInternalEvent(request));
      } catch (error) {
        console.error(error);

        return new Response(error, { status: 500 });
      }
    };

    if (typeof listen === "function") {
      await listen({
        handlerFn,
        abortSignal: this.abortController.signal,
      });
      return;
    }

    await serve(handlerFn, {
      hostname: listen?.hostname,
      port: listen?.port,
      signal: this.abortController.signal,
    });
  }

  protected createInternalEvent(request: Request): InternalizedEvent<_Event> {
    return {
      _internal: {
        hasCalledEnd: false,
        urlPatternResult: null,
      },
      request,
      response: getDefaultResponse(),
      end() {
        if (this._internal.hasCalledEnd) return;
        this._internal.hasCalledEnd = true;
      },
    } as InternalizedEvent<_Event>;
  }

  protected async handleRequest(event: InternalizedEvent<_Event>) {
    let pathName = new URL(event.request.url).pathname;
    if (
      !this._internal.options.shouldRepectTrailingSlash &&
      !pathName.endsWith("/")
    ) {
      pathName += "/";
    }

    let route = this.routes[event.request.method.toUpperCase() + pathName];

    if (!route) {
      // Try to find matching pattern if there was no direct match
      const urlPatternTestPath = URL_PATTERN_PREFIX + pathName;

      for (const _route of Object.values(this.routes)) {
        if (_route.urlPattern.test(urlPatternTestPath)) {
          event._internal.urlPatternResult =
            _route.urlPattern.exec(urlPatternTestPath);
          route = _route;
          break;
        }
      }

      if (!route) {
        return event.response;
      }
    }

    for (const step of route.steps) {
      const returnedEvent = await step(event);

      // Called `event.end()`. Ignore all further statements.
      if (event._internal.hasCalledEnd) {
        break;
      }

      if (!returnedEvent) {
        continue;
      }

      event = returnedEvent as InternalizedEvent<_Event>;
    }

    return event.response;
  }

  public route<__Event extends _Event>(
    path: string,
    options: RouteOptions<__Event> = {}
  ): Branch<__Event> {
    if (!path.startsWith("/")) {
      throw new Error('Route paths must start with a "/".');
    }

    if (
      !this._internal.options.shouldRepectTrailingSlash &&
      !path.endsWith("/")
    ) {
      path += "/";
    }

    return new Branch<__Event>({
      path,
      aquaInstance: this,
      steps: options.steps ?? [],
    });
  }

  public kill() {
    this.abortController.abort();
  }
}
