import { getAquaRequestFromNativeRequest, Json } from "./shared.ts";
import {
  findMatchingRegexRoute,
  findMatchingStaticRoute,
  findRouteWithMatchingURLParameters,
  parseRequestPath,
} from "./helpers/routing.ts";
import { getContentType } from "./helpers/content_identification.ts";

export type Method =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "DELETE"
  | "CONNECT"
  | "OPTIONS"
  | "TRACE"
  | "PATCH";

type OutgoingMiddleware = (
  req: Request,
  res: Response,
) => Response | Promise<Response>;
type IncomingMiddleware = (req: Request) => Request | Promise<Request>;

type RawResponse = string | Uint8Array | Response;
export type Response = ContentResponse | RedirectResponse;

interface ContentResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  redirect?: string;
  content: string | Uint8Array;
}

interface RedirectResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  redirect: string;
  content?: string | Uint8Array;
}

export interface Request {
  _internal: {
    respond(res: Response): void;
  };
  raw: Deno.RequestEvent["request"];
  url: string;
  method: Method;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, Json>;
  files: Record<string, File>;
  cookies: Record<string, string>;
  parameters: Record<string, string>;
  matches: string[];
  conn?: Deno.Conn;
}

type ResponseHandler = (req: Request) => RawResponse | Promise<RawResponse>;

interface RouteTemplate {
  options?: RoutingOptions;
  responseHandler: ResponseHandler;
}

export interface StringRoute extends RouteTemplate {
  path: string;
  method: Method;
  usesURLParameters: boolean;
  urlParameterRegex?: RegExp;
}

export interface RegexRoute extends RouteTemplate {
  path: RegExp;
  method: Method;
}

export interface StaticRoute extends RouteTemplate {
  folder: string;
  path: string;
}

export interface Options {
  ignoreTrailingSlash?: boolean;
  log?: boolean;
  tls?: {
    independentPort?: number;
    hostname?: string;
    certFile: string;
    keyFile: string;
  };
}

export type RoutingSchemaValidationFunction = (
  this: RoutingSchemaValidationContext,
  context: RoutingSchemaValidationContext,
) => boolean;

type BroadestSchemaValidationContextValueTypes = Json;

type RoutingSchemaValidationContext = Record<
  string,
  BroadestSchemaValidationContextValueTypes
>;

type RoutingSchemaKeys =
  | "body"
  | "query"
  | "cookies"
  | "parameters"
  | "headers";

type RoutingSchema = {
  [requestKey in RoutingSchemaKeys]?: RoutingSchemaValidationFunction[];
};

export interface RoutingOptions {
  schema?: RoutingSchema;
}

export enum MiddlewareType {
  Incoming = "Incoming",
  Outgoing = "Outgoing",
}

export function mustExist(key: string): RoutingSchemaValidationFunction {
  return function () {
    return Object.keys(this).includes(key);
  };
}

export function valueMustBeOfType(
  key: string,
  type: "string" | "number" | "boolean" | "object" | "undefined",
): RoutingSchemaValidationFunction {
  return function () {
    return Object.keys(this).includes(key) && typeof this[key] === type;
  };
}

export function mustContainValue(
  key: string,
  values: BroadestSchemaValidationContextValueTypes[],
): RoutingSchemaValidationFunction {
  return function () {
    return Object.keys(this).includes(key) && values.includes(this[key]);
  };
}

export default class Aqua {
  protected readonly options: Options = {};
  private routes: Record<string, StringRoute> = {};
  private regexRoutes: RegexRoute[] = [];
  private staticRoutes: StaticRoute[] = [];
  private incomingMiddlewares: IncomingMiddleware[] = [];
  private outgoingMiddlewares: OutgoingMiddleware[] = [];
  private fallbackHandler: ResponseHandler | null = null;

  constructor(port: number, options?: Options) {
    this.options = options || {};
    this.listen(port, {
      onlyTls: (options?.tls && !options.tls.independentPort) ||
        options?.tls?.independentPort === port,
    });

    if (this.options.log) {
      console.log(`Server started (http://localhost:${port})`);
    }
  }

  protected listen(port: number, { onlyTls }: { onlyTls: boolean }) {
    const listenerFns = [];

    if (this.options.tls) {
      listenerFns.push(
        Deno.listenTls.bind(undefined, {
          hostname: this.options.tls.hostname || "localhost",
          certFile: this.options.tls.certFile || "./localhost.crt",
          keyFile: this.options.tls.keyFile || "./localhost.key",
          port: this.options.tls.independentPort || port,
        }),
      );
    }

    if (!onlyTls) listenerFns.push(Deno.listen.bind(undefined, { port }));

    for (const listenerFn of listenerFns) {
      (async () => {
        for await (const conn of listenerFn()) {
          (async () => {
            for await (const event of Deno.serveHttp(conn)) {
              const req = await getAquaRequestFromNativeRequest(event, conn);
              this.handleRequest(req);
            }
          })();
        }
      })();
    }
  }

  private connectURLParameters(
    route: StringRoute,
    requestedPath: string,
  ): { [name: string]: string } {
    return route.path.match(/:([a-zA-Z0-9_]*)/g)?.reduce(
      (
        storage: { urlParameters: any; currentRequestedPath: string },
        urlParameterWithColon: string,
      ) => {
        const urlParameter = urlParameterWithColon.replace(":", "");
        const partTillParameter = route.path.split(urlParameterWithColon)[0];
        const urlParameterValue = storage.currentRequestedPath
          .replace(
            new RegExp(partTillParameter.replace(/:([a-zA-Z0-9_]*)/, ".*?")),
            "",
          )
          .match(/([^\/]*)/g)?.[0];
        const currentRequestedPath = storage.currentRequestedPath.replace(
          /:([a-zA-Z0-9_]*)/,
          "",
        );

        return {
          urlParameters: {
            ...storage.urlParameters,
            [urlParameter]: urlParameterValue,
          },
          currentRequestedPath,
        };
      },
      { urlParameters: {}, currentRequestedPath: requestedPath },
    ).urlParameters;
  }

  private isTextContent(rawResponse: RawResponse): rawResponse is string {
    return typeof rawResponse === "string";
  }

  private isDataContent(rawResponse: RawResponse): rawResponse is Uint8Array {
    return rawResponse instanceof Uint8Array;
  }

  private formatRawResponse(rawResponse: RawResponse): Response {
    if (this.isTextContent(rawResponse)) {
      return {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
        content: rawResponse,
      };
    }

    if (this.isDataContent(rawResponse)) {
      return { content: rawResponse };
    }

    return rawResponse;
  }

  private isRegexPath(path: string | RegExp): path is RegExp {
    return path instanceof RegExp;
  }

  private async getOutgoingResponseAfterApplyingMiddlewares(
    req: Request,
    res: Response,
  ): Promise<Response> {
    let responseAfterMiddlewares: Response = res;
    for (const middleware of this.outgoingMiddlewares) {
      responseAfterMiddlewares = await middleware(
        req,
        responseAfterMiddlewares,
      );
    }
    return responseAfterMiddlewares;
  }

  private async getIncomingRequestAfterApplyingMiddlewares(req: Request) {
    let requestAfterMiddleWares: Request = req;
    for (const middleware of this.incomingMiddlewares) {
      requestAfterMiddleWares = await middleware(req);
    }
    return requestAfterMiddleWares;
  }

  private async respondToRequest(
    req: Request,
    requestedPath: string,
    route: StringRoute | RegexRoute | StaticRoute,
    additionalResponseOptions: {
      usesURLParameters?: boolean;
      customResponseHandler?: ResponseHandler | undefined;
    } = { usesURLParameters: false, customResponseHandler: undefined },
  ) {
    if (additionalResponseOptions.usesURLParameters) {
      req.parameters = this.connectURLParameters(
        route as StringRoute,
        requestedPath,
      );

      if (
        Object.values(req.parameters).find(
          (parameterValue) => parameterValue === "",
        ) !== undefined
      ) {
        await this.respondWithNoRouteFound(req);
        return;
      }
    }

    if (route.options?.schema) {
      let passedAllValidations = true;

      routingSchemaIterator:
      for (
        const routingSchemaKey of Object.keys(
          route.options.schema,
        ) as RoutingSchemaKeys[]
      ) {
        for (
          const validationFunction of route.options.schema[
            routingSchemaKey
          ] || []
        ) {
          const schemaContext = req[routingSchemaKey];
          if (!validationFunction.bind(schemaContext)(schemaContext)) {
            passedAllValidations = false;
            break routingSchemaIterator;
          }
        }
      }

      if (!passedAllValidations) {
        await this.respondWithNoRouteFound(req);
        return;
      }
    }

    if (this.isRegexPath(route.path)) {
      req.matches = (requestedPath.match(route.path) as string[]).slice(1) ||
        [];
    }

    const formattedResponse: Response = this.formatRawResponse(
      await (additionalResponseOptions.customResponseHandler
        ? additionalResponseOptions.customResponseHandler(req)
        : (route as StringRoute | RegexRoute).responseHandler(req)),
    );

    if (!formattedResponse) {
      req._internal.respond({ content: "No response content provided." });
      return;
    }

    const responseAfterMiddlewares: Response = await this
      .getOutgoingResponseAfterApplyingMiddlewares(
        req,
        formattedResponse,
      );

    req._internal.respond(responseAfterMiddlewares);
  }

  private async getFallbackHandlerResponse(req: Request): Promise<Response> {
    if (this.fallbackHandler) {
      const fallbackResponse: Response = this.formatRawResponse(
        await this.fallbackHandler(req),
      );

      if (!fallbackResponse) {
        return { statusCode: 404, content: "Not found." };
      }

      const statusCode =
        (!fallbackResponse.redirect && fallbackResponse.statusCode) || 404;

      return {
        statusCode,
        headers: fallbackResponse.headers,
        content: fallbackResponse.content ||
          "No fallback response content provided.",
      };
    }

    return { statusCode: 404, content: "Not found." };
  }

  private async respondWithNoRouteFound(req: Request): Promise<void> {
    req._internal.respond(await this.getFallbackHandlerResponse(req));
  }

  private async handleStaticRequest(
    req: Request,
    { path, folder }: { path: string; folder: string },
  ): Promise<Response> {
    const requestedPath = parseRequestPath(req.url);
    const resourcePath: string = requestedPath.replace(path, "");
    const extension: string = resourcePath.replace(
      /.*(?=\.[a-zA-Z0-9_]*$)/,
      "",
    );
    const contentType: string | null = extension
      ? getContentType(extension)
      : null;

    try {
      return {
        headers: contentType ? { "Content-Type": contentType } : undefined,
        content: await Deno.readFile(folder + resourcePath),
      };
    } catch {
      return await this.getFallbackHandlerResponse(req);
    }
  }

  protected async handleRequest(req: Request) {
    if (this.options.ignoreTrailingSlash) {
      req.url = req.url.replace(/\/$/, "") + "/";
    }

    req = await this.getIncomingRequestAfterApplyingMiddlewares(req);

    const requestedPath = parseRequestPath(req.url);

    if (this.options.log) {
      console.log(
        `\x1b[33m${req.method} \x1b[0m(\x1b[36mIncoming\x1b[0m) \x1b[0m${requestedPath}\x1b[0m`,
      );
    }

    if (this.routes[req.method + requestedPath]) {
      this.respondToRequest(
        req,
        requestedPath,
        this.routes[req.method + requestedPath],
      );
      return;
    }

    const matchingRouteWithURLParameters = findRouteWithMatchingURLParameters(
      requestedPath,
      this.routes,
      req.method,
    );

    if (matchingRouteWithURLParameters) {
      this.respondToRequest(
        req,
        requestedPath,
        matchingRouteWithURLParameters,
        { usesURLParameters: true },
      );
      return;
    }

    const matchingRegexRoute = findMatchingRegexRoute(
      requestedPath,
      this.regexRoutes,
      req.method,
    );

    if (matchingRegexRoute) {
      this.respondToRequest(req, requestedPath, matchingRegexRoute);
      return;
    }

    if (req.method === "GET") {
      const matchingStaticRoute = findMatchingStaticRoute(
        requestedPath,
        this.staticRoutes,
      );

      if (matchingStaticRoute) {
        this.respondToRequest(req, requestedPath, matchingStaticRoute);
        return;
      }
    }

    this.respondWithNoRouteFound(req);
  }

  public provideFallback(responseHandler: ResponseHandler): Aqua {
    this.fallbackHandler = responseHandler;
    return this;
  }

  public register<_, Type extends MiddlewareType = MiddlewareType.Outgoing>(
    middleware: Type extends undefined ? OutgoingMiddleware
      : Type extends MiddlewareType.Incoming ? IncomingMiddleware
      : OutgoingMiddleware,
    type?: Type,
  ): Aqua {
    if (type === MiddlewareType.Incoming) {
      this.incomingMiddlewares.push(middleware as IncomingMiddleware);
      return this;
    }

    this.outgoingMiddlewares.push(middleware as OutgoingMiddleware);
    return this;
  }

  public route(
    path: string | RegExp,
    method: Method,
    responseHandler: ResponseHandler,
    options: RoutingOptions = {},
  ): Aqua {
    if (path instanceof RegExp) {
      this.regexRoutes.push({ path, responseHandler, method });
      return this;
    }

    if (!path.startsWith("/")) throw Error("Routes must start with a slash");
    if (this.options.ignoreTrailingSlash) path = path.replace(/\/$/, "") + "/";

    const usesURLParameters = /:[a-zA-Z]/.test(path);

    this.routes[method.toUpperCase() + path] = {
      path,
      usesURLParameters,
      urlParameterRegex: usesURLParameters
        ? new RegExp(path.replace(/:([a-zA-Z0-9_]*)/g, "([^/]*)"))
        : undefined,
      responseHandler,
      options,
      method,
    };
    return this;
  }

  public get(
    path: string | RegExp,
    responseHandler: ResponseHandler,
    options: RoutingOptions = {},
  ): Aqua {
    this.route(path, "GET", responseHandler, options);
    return this;
  }

  public post(
    path: string | RegExp,
    responseHandler: ResponseHandler,
    options: RoutingOptions = {},
  ): Aqua {
    this.route(path, "POST", responseHandler, options);
    return this;
  }

  public put(
    path: string | RegExp,
    responseHandler: ResponseHandler,
    options: RoutingOptions = {},
  ): Aqua {
    this.route(path, "PUT", responseHandler, options);
    return this;
  }

  public patch(
    path: string | RegExp,
    responseHandler: ResponseHandler,
    options: RoutingOptions = {},
  ): Aqua {
    this.route(path, "PATCH", responseHandler, options);
    return this;
  }

  public delete(
    path: string | RegExp,
    responseHandler: ResponseHandler,
    options: RoutingOptions = {},
  ): Aqua {
    this.route(path, "DELETE", responseHandler, options);
    return this;
  }

  public serve(
    folder: string,
    path: string,
    options: RoutingOptions = {},
  ): Aqua {
    if (!path.startsWith("/")) throw Error("Routes must start with a slash");
    this.staticRoutes.push({
      folder: folder.replace(/\/$/, "") + "/",
      path: path.replace(/\/$/, "") + "/",
      responseHandler: async (req) =>
        await this.handleStaticRequest(req, { path, folder }),
      options,
    });
    return this;
  }
}
