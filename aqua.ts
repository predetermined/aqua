export type AquaResponse = Response;
export type AquaRequest = Request;

export interface Options {
  port: number;
  /**
   * Uses your own listener provider functions instead of the default
   * one.
   * @default [(port: number) => Deno.listen({ port })]
   */
  customListenerProviders?: ((port: number) => Deno.Listener)[];
}

export enum Method {
  GET = "GET",
}

export type StepFn<_Event extends Event> = (
  event: _Event
) => _Event | Promise<_Event>;

export type RespondFn<_Event extends Event> = (
  event: _Event
) => _Event["response"];

export interface RouteOptions<_Event extends Event> {
  steps?: StepFn<_Event>[];
}

export interface BranchOptions<_Event extends Event>
  extends Required<Pick<RouteOptions<_Event>, "steps">> {
  path: string;
  method: Method;
  aquaInstance: Aqua;
}

export interface Event {
  conn?: Deno.Conn;
  request: Request;
  response: Response;
  // @TODO: decide whether to hide this function
  /**
   * Responds to the request with the currently set `response`.
   */
  end(): void;
}

export function parseRequestPath(url: string) {
  return url.replace(/(\?(.*))|(\#(.*))/, "");
}

export class Branch<_Event extends Event> {
  private options: BranchOptions<_Event>;
  private steps: StepFn<_Event>[] = [];

  public _internal = {
    respond: async (event: _Event) => {
      for (const step of this.steps) {
        event = await step(event);
      }

      event.end();
    },
  };

  constructor(options: BranchOptions<_Event>) {
    this.steps = options.steps;
    this.options = options;
  }

  public step<_StepFn extends StepFn<_Event>>(stepFn: _StepFn) {
    this.steps.push(stepFn);
    return this as unknown as Branch<Awaited<ReturnType<_StepFn>>>;
  }

  public respond<_RespondFn extends RespondFn<_Event>>(respondFn: _RespondFn) {
    this.steps.push(async (event) => {
      event.response = await respondFn(event);
      return event;
    });
    return this as unknown as Branch<
      _Event & {
        response: Awaited<ReturnType<_RespondFn>>;
      }
    >;
  }

  public route(path: string, method: Method, options: RouteOptions<_Event>) {
    return this.options.aquaInstance.route<_Event>(
      this.options.path + path,
      method,
      {
        steps: [...this.steps, ...(options?.steps ?? [])],
      }
    );
  }
}

export class Aqua<_Event extends Event = Event> {
  private readonly options: Options;
  protected routes: Record<string, Branch<any>> = {};

  constructor(options: Options) {
    this.options = options;
    this.listen({
      port: options.port,
      customListenerProviders: options.customListenerProviders,
    });
  }

  private getResponseFromAquaResponse(response: AquaResponse) {
    return typeof response === "string" ? new Response(response) : response;
  }

  protected createCustomEvent(
    event: Deno.RequestEvent,
    conn: Deno.Conn
  ): Event {
    return {
      conn,
      request: event.request,
      response: new Response(),
      end() {
        const { body, ...init } = this.response;
        event.respondWith(new Response(body, init));
      },
    };
  }

  protected listen({
    port,
    customListenerProviders,
  }: Pick<Options, "port" | "customListenerProviders">) {
    const listenerProviders = customListenerProviders ?? [
      () => Deno.listen({ port }),
    ];

    for (const listenerFn of listenerProviders) {
      (async () => {
        for await (const conn of listenerFn(port)) {
          (async () => {
            for await (const event of Deno.serveHttp(conn)) {
              try {
                this.handleRequest(this.createCustomEvent(event, conn));
              } catch (e) {
                event.respondWith(new Response(e, { status: 500 }));
              }
            }
          })();
        }
      })();
    }
  }

  protected handleRequest(event: Event) {
    const route =
      this.routes[
        event.request.method.toUpperCase() +
          parseRequestPath(new URL(event.request.url).pathname)
      ];

    if (!route) {
      event.response = new Response("Not found.", { status: 404 });
      event.end();
      return;
    }

    route._internal.respond(event);
  }

  public route<__Event extends _Event>(
    path: string,
    method: Method,
    options: RouteOptions<__Event> = {}
  ): Branch<__Event> {
    if (!path.startsWith("/")) {
      throw new Error('Route paths must start with a "/".');
    }

    return (this.routes[method + path] = new Branch<__Event>({
      path,
      method,
      aquaInstance: this,
      steps: options.steps ?? [],
    }));
  }

  public async fakeCall(request: Request): Promise<Response> {
    return await new Promise((resolve) => {
      this.handleRequest({
        request,
        response: new Response(),
        end() {
          const { body, ...init } = this.response;
          resolve(new Response(body, init));
        },
      });
    });
  }
}
