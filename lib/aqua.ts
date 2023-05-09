import { serve } from "https://deno.land/std@0.185.0/http/server.ts";
import { ResponseError } from "./response-error.ts";

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

export enum Method {
  GET = "GET",
  HEAD = "HEAD",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  CONNECT = "CONNECT",
  OPTIONS = "OPTIONS",
  TRACE = "TRACE",
  PATCH = "PATCH",
}

export type StepFn<_Event extends Event> = (
  event: _Event
) => _Event | Promise<_Event> | void;

export type RespondFn<_Event extends Event> = (
  event: _Event
) => _Event["response"] | Promise<_Event["response"]>;

export interface RouteOptions<_Event extends Event> {
  steps?: StepFn<_Event>[];
}

export interface BranchOptions<_Event extends Event>
  extends Required<Pick<RouteOptions<_Event>, "steps">> {
  path: string;
  aquaInstance: Aqua;
}

export interface Event {
  request: Request;
  response: Response;
  /**
   * Responds to the event with the currently set `response`.
   * This function should not be called multiple times.
   * @todo Is there maybe a way to allow no statements after this fn has been called?
   */
  end(): void;
  [key: string]: unknown;
}

interface InternalEvent extends Event {
  _internal: {
    hasCalledEnd: boolean;
  };
}

type InternalizedEvent<_Event extends Event> = _Event & InternalEvent;

interface AquaInternals<_Event extends Event> {
  options: AquaOptions;
  setRoute<__Event extends _Event>(
    method: Method,
    path: string,
    steps: StepFn<__Event>[]
  ): void;
}

interface BranchInternals<_Event extends Event> {
  options: BranchOptions<_Event>;
  path: string;
}

type BranchStepReturnType<
  _Event extends Event,
  _StepFn extends StepFn<_Event>,
  This extends Branch<_Event> | ResponderBranch<_Event>
> = Awaited<ReturnType<_StepFn>> extends never
  ? never
  : Awaited<ReturnType<_StepFn>> extends _Event
  ? This extends ResponderBranch<_Event>
    ? ResponderBranch<Awaited<ReturnType<_StepFn>>>
    : Branch<Awaited<ReturnType<_StepFn>>>
  : This;

function getDefaultResponse() {
  return new Response("Not found.", { status: 404 });
}

class Branch<_Event extends Event> {
  private steps: StepFn<_Event>[] = [];

  public _internal: BranchInternals<_Event>;

  constructor(options: BranchOptions<_Event>) {
    this._internal = {
      options,
      path: options.path,
    };
    this.steps = options.steps;
  }

  public route(path: string, options: RouteOptions<_Event> = {}) {
    if (!path.startsWith("/")) {
      throw new Error('Route paths must start with a "/".');
    }

    const joinedPath = this._internal.options.path.replace(/\/$/, "") + path;

    return this._internal.options.aquaInstance.route<_Event>(joinedPath, {
      steps: [...this.steps, ...(options?.steps ?? [])],
    });
  }

  public step<_StepFn extends StepFn<_Event>>(stepFn: _StepFn) {
    this.steps.push(stepFn);

    return this as BranchStepReturnType<_Event, _StepFn, typeof this>;
  }

  public respond<_RespondFn extends RespondFn<_Event>>(
    method: Method,
    respondFn: _RespondFn
  ) {
    this._internal.options.aquaInstance._internal.setRoute(
      method,
      this._internal.path,
      [
        ...this.steps,
        async (event: _Event) => {
          event.response = await respondFn(event);
          return event;
        },
      ]
    );

    return new ResponderBranch(this);
  }
}

/**
 * Used for every operation after the `.on(...)` call.
 */
export class ResponderBranch<_Event extends Event>
  implements Omit<Branch<_Event>, "route" | "step">
{
  get _internal() {
    return this.branch._internal;
  }

  constructor(private branch: Branch<_Event>) {}

  public respond<_RespondFn extends RespondFn<_Event>>(
    method: Method,
    respondFn: _RespondFn
  ) {
    return this.branch.respond(method, respondFn);
  }
}

export class Aqua<_Event extends Event = Event> {
  private abortController: AbortController;

  protected routes: Record<
    string,
    {
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
        this.routes[method + path] = { steps };
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
        if (error instanceof ResponseError) {
          return error.response;
        }

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

  protected createInternalEvent(request: Request): InternalEvent {
    return {
      _internal: {
        hasCalledEnd: false,
      },
      request,
      response: getDefaultResponse(),
      end() {
        if (this._internal.hasCalledEnd) return;
        this._internal.hasCalledEnd = true;
      },
    };
  }

  protected async handleRequest(event: InternalEvent) {
    let pathName = new URL(event.request.url).pathname;
    if (
      !this._internal.options.shouldRepectTrailingSlash &&
      !pathName.endsWith("/")
    ) {
      pathName += "/";
    }

    const route = this.routes[event.request.method.toUpperCase() + pathName];

    if (!route) {
      return event.response;
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

  public async fakeCall(request: Request): Promise<Response> {
    return await new Promise((resolve) => {
      this.handleRequest({
        _internal: {
          hasCalledEnd: false,
        },
        request,
        response: getDefaultResponse(),
        end() {
          if (this._internal.hasCalledEnd) return;
          this._internal.hasCalledEnd = true;

          const { body, ...init } = this.response;
          resolve(new Response(body, init));
        },
      });
    });
  }
}
