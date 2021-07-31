import {
  serve,
  Server,
  ServerRequest,
  ServerResponse,
  serveTLS,
} from "./shared.ts";
import Router from "./router.ts";
import ContentHandler from "./content_handler.ts";

type ResponseHandler = (req: Request) => RawResponse | Promise<RawResponse>;

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

interface ServerRequestWithRawRespond extends ServerRequest {
  rawRespond: (res: ServerResponse) => Promise<void>;
}

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
  raw: ServerRequest;
  url: string;
  method: Method;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, string | number | boolean | null | object>;
  files: Record<string, File>;
  cookies: Record<string, string>;
  parameters: Record<string, string>;
  matches: string[];
}

interface RouteTemplate {
  options?: RoutingOptions;
  responseHandler: ResponseHandler;
}

export interface StringRoute extends RouteTemplate {
  path: string;
  usesURLParameters: boolean;
  urlParameterRegex?: RegExp;
}

export interface RegexRoute extends RouteTemplate {
  path: RegExp;
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
  _experimental?: {
    skipServing?: boolean;
  };
}

export type RoutingSchemaValidationFunction = (
  this: RoutingSchemaValidationContext,
  context: RoutingSchemaValidationContext,
) => boolean;

type BroadestSchemaValidationContextValueTypes =
  | string
  | number
  | boolean
  | null
  | object;

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
  private readonly textDecoder: TextDecoder;
  private readonly textEncoder: TextEncoder;
  private readonly servers: Server[] = [];
  private routes: { [path: string]: StringRoute } = {};
  private regexRoutes: RegexRoute[] = [];
  private staticRoutes: StaticRoute[] = [];
  private options: Options = {};
  private incomingMiddlewares: IncomingMiddleware[] = [];
  private outgoingMiddlewares: OutgoingMiddleware[] = [];
  private fallbackHandler: ResponseHandler | null = null;

  constructor(port: number, options?: Options) {
    if (!options?._experimental?.skipServing) {
      const onlyTLS = (options?.tls && !options.tls.independentPort) ||
        options?.tls?.independentPort === port;

      if (options?.tls) {
        this.servers.push(
          serveTLS({
            hostname: options.tls.hostname || "localhost",
            certFile: options.tls.certFile || "./localhost.crt",
            keyFile: options.tls.keyFile || "./localhost.key",
            port: options.tls.independentPort || port,
          }),
        );
      }

      if (!onlyTLS) this.servers.push(serve({ port }));
    }

    this.textDecoder = new TextDecoder();
    this.textEncoder = new TextEncoder();
    this.options = options || {};
    this.spinUpServers();
    if (this.options.log) {
      console.log(`Server started (http://localhost:${port})`);
    }
  }

  public async render(filePath: string): Promise<string> {
    try {
      return this.textDecoder.decode(await Deno.readFile(filePath));
    } catch (error) {
      if (error instanceof Deno.errors.PermissionDenied) {
        return "Please run your application with the '--allow-read' flag.";
      }

      return "Could not render file.";
    }
  }

  protected async parseBody(
    buffer: Uint8Array,
  ): Promise<{
    body: { [name: string]: string };
    files: { [name: string]: File };
  }> {
    const rawBody: string = this.textDecoder.decode(buffer);
    let body: { [name: string]: any } = {};

    if (!rawBody) return { body: {}, files: {} };

    const files: { [name: string]: File } = (
      rawBody.match(
        /---(\n|\r|.)*?Content-Type.*(\n|\r)+(\n|\r|.)*?(?=((\n|\r)--|$))/g,
      ) || []
    ).reduce((files: { [name: string]: File }, fileString: string, i) => {
      const fileName = /filename="(.*?)"/.exec(fileString)?.[1];
      const fileType = /Content-Type: (.*)/.exec(fileString)?.[1]?.trim();
      const name = /name="(.*?)"/.exec(fileString)?.[1];

      if (!fileName || !name) return files;

      const uniqueString = fileString.match(
        /---(\n|\r|.)*?Content-Type.*(\n|\r)+(\n|\r|.)*?/g,
      )?.[0];

      if (!uniqueString) return files;

      const uniqueStringEncoded = this.textEncoder.encode(uniqueString);
      const endSequence = this.textEncoder.encode("----");

      let start = -1;
      let end = buffer.length;
      for (let i = 0; i < buffer.length; i++) {
        if (start === -1) {
          let matchedUniqueString = true;
          let uniqueStringEncodedIndex = 0;
          for (let j = i; j < i + uniqueStringEncoded.length; j++) {
            if (buffer[j] !== uniqueStringEncoded[uniqueStringEncodedIndex]) {
              matchedUniqueString = false;
              break;
            }
            uniqueStringEncodedIndex++;
          }

          if (matchedUniqueString) {
            i = start = i + uniqueStringEncoded.length;
          }
          continue;
        }

        let matchedEndSequence = true;
        let endSequenceIndex = 0;
        for (let j = i; j < i + endSequence.length; j++) {
          if (buffer[j] !== endSequence[endSequenceIndex]) {
            matchedEndSequence = false;
            break;
          }
          endSequenceIndex++;
        }

        if (matchedEndSequence) {
          end = i;
          break;
        }
      }

      if (start === -1) return files;

      const fileBuffer = buffer.subarray(start, end);
      const file = new File([fileBuffer], fileName, { type: fileType });

      return { [name]: file, ...files };
    }, {});

    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      if (rawBody.includes(`name="`)) {
        body = (
          rawBody.match(/name="(.*?)"(\s|\n|\r)*(.*)(\s|\n|\r)*---/gm) || []
        ).reduce((fields: {}, field: string): { [name: string]: string } => {
          if (!/name="(.*?)"/.exec(field)?.[1]) return fields;

          return {
            ...fields,
            [/name="(.*?)"/.exec(field)?.[1] || ""]: field.match(
              /(.*?)(?=(\s|\n|\r)*---)/,
            )?.[0],
          };
        }, {});
      } else {
        body = Object.fromEntries(new URLSearchParams(rawBody));
      }
    }

    return { body, files };
  }

  protected parseQuery(url: string): Record<string, string> {
    if (!url.includes("?")) return {};

    return Object.fromEntries(new URLSearchParams(url.replace(/(.*)\?/, "")));
  }

  protected parseCookies(headers: Headers): Record<string, string> {
    const rawCookieString: string | null = headers.get("cookie");

    if (!rawCookieString) return {};

    return rawCookieString.split(";").reduce((cookies: {}, cookie: string): {
      [name: string]: string;
    } => {
      return {
        ...cookies,
        [cookie.split("=")[0].trimLeft()]: cookie.split("=")[1],
      };
    }, {});
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

  private getChangedObjectValueKeys(
    object1: Record<string, any>,
    object2: Record<string, any>,
  ): string[] {
    const allKeys = [
      ...new Set([...Object.keys(object1), ...Object.keys(object2)]),
    ];
    return allKeys.filter((key) => object1[key] !== object2[key]);
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

    if (this.options.log) {
      console.log(
        `\x1b[33m${req.method} \x1b[0m(\x1b[36mMiddleware\x1b[0m) \x1b[0mChanged response \`${
          this.getChangedObjectValueKeys(
            res,
            responseAfterMiddlewares,
          ).join("`, `")
        }\`\x1b[0m`,
      );
    }

    return responseAfterMiddlewares;
  }

  private async getIncomingRequestAfterApplyingMiddlewares(req: Request) {
    let requestAfterMiddleWares: Request = req;
    for (const middleware of this.incomingMiddlewares) {
      requestAfterMiddleWares = await middleware(req);
    }

    if (this.options.log) {
      console.log(
        `\x1b[33m${req.method} \x1b[0m(\x1b[36mMiddleware\x1b[0m) \x1b[0mChanged request \`${
          this.getChangedObjectValueKeys(
            req,
            requestAfterMiddleWares,
          ).join("`, `")
        }\`\x1b[0m`,
      );
    }

    return requestAfterMiddleWares;
  }

  private convertResponseToServerResponse(res: Response): ServerResponse {
    const headers: Headers = new Headers(res.headers || {});
    let statusCode: number | undefined = res.statusCode;

    if (res.cookies) {
      for (const cookieName of Object.keys(res.cookies)) {
        headers.append(
          "Set-Cookie",
          `${cookieName}=${res.cookies[cookieName]}`,
        );
      }
    }

    if (res.redirect) {
      headers.append("Location", res.redirect);
      statusCode ||= 301;
    }

    return {
      headers,
      body: res.content,
      status: statusCode || 200,
    };
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
      req.raw.respond({ body: "No response content provided." });
      return;
    }

    const responseAfterMiddlewares: Response = await this
      .getOutgoingResponseAfterApplyingMiddlewares(
        req,
        formattedResponse,
      );
    const serverResponse: ServerResponse = this.convertResponseToServerResponse(
      responseAfterMiddlewares,
    );
    req.raw.respond(serverResponse);
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
    const serverResponse = this.convertResponseToServerResponse(
      await this.getFallbackHandlerResponse(req),
    );
    req.raw.respond(serverResponse);
  }

  protected spinUpServers() {
    for (const server of this.servers) {
      (async () => {
        for await (const rawRequest of server) {
          this.handleRequest(rawRequest);
        }
      })();
    }
  }

  private async handleStaticRequest(
    req: Request,
    { path, folder }: { path: string; folder: string },
  ): Promise<Response> {
    const requestedPath = Router.parseRequestPath(req.url);
    const resourcePath: string = requestedPath.replace(path, "");
    const extension: string = resourcePath.replace(
      /.*(?=\.[a-zA-Z0-9_]*$)/,
      "",
    );
    const contentType: string | null = extension
      ? ContentHandler.getContentType(extension)
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

  protected async parseRequest(
    // So the method signature can be overridden
    _rawRequest: unknown,
  ): Promise<Request> {
    const rawRequest = _rawRequest as ServerRequest;
    const { body, files } = rawRequest.contentLength
      ? await this.parseBody(await Deno.readAll(rawRequest.body))
      : { body: {}, files: {} };

    return {
      raw: rawRequest,
      url: rawRequest.url,
      headers: Object.fromEntries(rawRequest.headers),
      method: rawRequest.method.toUpperCase() as Method,
      query: rawRequest.url.includes("?")
        ? this.parseQuery(rawRequest.url)
        : {},
      body,
      files,
      cookies: rawRequest.headers.get("cookies")
        ? this.parseCookies(rawRequest.headers)
        : {},
      parameters: {},
      matches: [],
    };
  }

  protected async handleRequest(rawRequest: ServerRequest | any) {
    if (this.options.ignoreTrailingSlash) {
      rawRequest.url = rawRequest.url.replace(/\/$/, "") + "/";
    }

    const req = await this.getIncomingRequestAfterApplyingMiddlewares(
      await this.parseRequest(rawRequest),
    );

    const requestedPath = Router.parseRequestPath(req.url);

    if (this.options.log) {
      console.log(
        `\x1b[33m${req.method} \x1b[0m(\x1b[36mIncoming\x1b[0m) \x1b[0m${requestedPath}\x1b[0m`,
      );
      (req.raw as ServerRequestWithRawRespond).rawRespond = req.raw.respond;
      req.raw.respond = async (res: ServerResponse) => {
        console.log(
          `\x1b[33m${req.method} \x1b[0m(\x1b[36mResponded\x1b[0m) \x1b[0m${requestedPath} -> \x1b[36m${res
            .status || 200}\x1b[0m`,
        );
        await (req.raw as ServerRequestWithRawRespond).rawRespond(res);
      };
    }

    if (!this.routes[req.method + requestedPath]) {
      const matchingRouteWithURLParameters = Router
        .findRouteWithMatchingURLParameters(
          requestedPath,
          this.routes,
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

      const matchingRegexRoute = Router.findMatchingRegexRoute(
        requestedPath,
        this.regexRoutes,
      );

      if (matchingRegexRoute) {
        this.respondToRequest(
          req,
          requestedPath,
          matchingRegexRoute as RegexRoute,
        );
        return;
      }

      if (req.method === "GET") {
        const matchingStaticRoute = Router.findMatchingStaticRoute(
          requestedPath,
          this.staticRoutes,
        );

        if (matchingStaticRoute) {
          this.respondToRequest(req, requestedPath, matchingStaticRoute);
          return;
        }
      }

      this.respondWithNoRouteFound(req);
    } else {
      this.respondToRequest(
        req,
        requestedPath,
        this.routes[req.method + requestedPath],
      );
    }
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
      this.regexRoutes.push({ path, responseHandler });
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
    } as StringRoute;
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
