export type AquaResponse = string | Response;

type RequestRespondFn = (response: AquaResponse) => void;

interface AquaRequestInternals {
  respond: RequestRespondFn;
  conn?: Deno.Conn;
}

export class AquaRequest extends Request {
  public _internal = {} as AquaRequestInternals;
  private _uint8Body: Uint8Array | Promise<Uint8Array>;

  constructor({
    request,
    respond,
    conn,
  }: {
    request: Request;
    respond(response: AquaResponse): void;
    conn?: Deno.Conn;
  }) {
    super(request);

    this._internal.respond = respond;
    this._internal.conn = conn;
    this._uint8Body = this.arrayBuffer().then((data) => {
      this._uint8Body = new Uint8Array(data);
      return this._uint8Body;
    });
  }

  public get path() {
    return new URL(this.url).pathname;
  }

  /**
   * Extend the `AquaRequest` instance the way you like.
   * Do not forget to to return it's value in a `step` function
   * to stay type-safe.
   *
   * @example
   * request.extend({ isAwesomeRequest: true });
   *
   * @example
   * app
   *  .route(...)
   *  .step(request => {
   *    if (!isValidRequest(request)) throw new AquaError(400, "No, no, no!");
   *
   *    return request.extend({ isAwesomeRequest: true });
   *  })
   *  .respond(...);
   */
  public extend<ExtensionObj extends Record<string, unknown>>(
    extensionObj: ExtensionObj
  ): AquaRequest & ExtensionObj {
    for (const [key, value] of Object.entries(extensionObj)) {
      this[key as keyof typeof this] = value as this[keyof this];
    }

    return this as AquaRequest & ExtensionObj;
  }
}

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

export type StepFn<_Request extends AquaRequest> = (req: _Request) => _Request;
export type RespondFn<_Request extends AquaRequest> = (
  request: _Request
) => AquaResponse | Promise<AquaResponse>;

export interface RouteOptions<_Request extends AquaRequest> {
  steps?: StepFn<_Request>[];
}

export interface BranchOptions<_Request extends AquaRequest>
  extends Required<Pick<RouteOptions<_Request>, "steps">> {
  path: string;
  method: Method;
  aquaInstance: Aqua;
}

export function parseRequestPath(url: string) {
  return url.replace(/(\?(.*))|(\#(.*))/, "");
}

export class Branch<_Request extends AquaRequest> {
  private options: BranchOptions<_Request>;
  private steps: StepFn<_Request>[] = [];
  private responder: RespondFn<_Request> | undefined;

  public _internal = {
    hasResponder: () => {
      return !!this.responder;
    },
    respond: async (request: _Request) => {
      for (const step of this.steps) {
        request = step(request);
      }

      request._internal.respond!(await this.responder!(request));
    },
  };

  constructor(options: BranchOptions<_Request>) {
    this.steps = options.steps;
    this.options = options;
  }

  public step<_StepFn extends StepFn<_Request>>(
    stepFn: _StepFn
  ): Branch<ReturnType<_StepFn>> {
    this.steps.push(stepFn);
    return this as unknown as Branch<ReturnType<_StepFn>>;
  }

  public respond(responder: RespondFn<_Request>) {
    this.responder = responder;
  }

  public route(path: string, method: Method, options: RouteOptions<_Request>) {
    return this.options.aquaInstance.route<_Request>(
      this.options.path + path,
      method,
      {
        steps: [...this.steps, ...(options?.steps ?? [])],
      }
    );
  }
}

export class Aqua<_Request extends AquaRequest = AquaRequest> {
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

  protected turnEventIntoRequest(
    event: Deno.RequestEvent,
    conn: Deno.Conn
  ): AquaRequest {
    return new AquaRequest({
      request: event.request,
      respond: (response) => {
        event.respondWith(this.getResponseFromAquaResponse(response));
      },
      conn,
    });
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
                this.handleRequest(this.turnEventIntoRequest(event, conn));
              } catch (e) {
                event.respondWith(new Response(e, { status: 500 }));
              }
            }
          })();
        }
      })();
    }
  }

  protected handleRequest(request: AquaRequest) {
    const route = this.routes[request.method.toUpperCase() + request.path];

    if (!route || !route._internal.hasResponder()) {
      request._internal.respond(new Response("Not found.", { status: 404 }));
      return;
    }

    route._internal.respond(request);
  }

  public route<__Request extends _Request>(
    path: string,
    method: Method,
    options: RouteOptions<__Request> = {}
  ): Branch<__Request> {
    if (!path.startsWith("/")) {
      throw new Error('Route paths must start with a "/".');
    }

    return (this.routes[method + path] = new Branch<__Request>({
      path,
      method,
      aquaInstance: this,
      steps: options.steps ?? [],
    }));
  }

  public async fakeCall(request: Request): Promise<Response> {
    return await new Promise((resolve) => {
      this.handleRequest(
        new AquaRequest({
          request,
          respond: (response) => {
            resolve(this.getResponseFromAquaResponse(response));
          },
        })
      );
    });
  }
}
