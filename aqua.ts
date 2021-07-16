import Router from "./router.ts";
import ContentHandler from "./content_handler.ts";

type ResponseHandler = (req: Request) => (RawResponse | Promise<RawResponse>);
type Method =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "DELETE"
  | "CONNECT"
  | "OPTIONS"
  | "TRACE"
  | "PATCH";
type Middleware = (
  req: Request,
  res: Response,
) => (Response | Promise<Response>);
type RawResponse = string | Uint8Array | Response;
export type Response = ContentResponse | RedirectResponse;

interface ContentResponse {
  statusCode?: number;
  headers?: { [name: string]: string };
  cookies?: { [name: string]: string };
  redirect?: string;
  content: string | Uint8Array;
}

interface RedirectResponse {
  statusCode?: number;
  headers?: { [name: string]: string };
  cookies?: { [name: string]: string };
  redirect: string;
  content?: string | Uint8Array;
}

export interface Request {
  url: string;
  method: Method;
  headers: { [name: string]: string };
  query: { [name: string]: string };
  body: { [name: string]: string };
  files: { [name: string]: File };
  cookies: { [name: string]: string };
  parameters: { [name: string]: string };
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
}

export type RoutingSchemaValidationFunction = (
  this: RoutingSchemaValidationContext,
  context: RoutingSchemaValidationContext,
) => boolean;

interface RoutingSchemaValidationContext {
  [name: string]: any;
}

type RoutingSchemaKeys = "body" | "query" | "cookies" | "parameters";

type RoutingSchema = {
  [requestKey in RoutingSchemaKeys]?: RoutingSchemaValidationFunction[];
};

export interface RoutingOptions {
  schema?: RoutingSchema;
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
  values: any[],
): RoutingSchemaValidationFunction {
  return function () {
    return Object.keys(this).includes(key) && values.includes(this[key]);
  };
}

interface InterpretedServerRequest {
  info: string[];
  data: string;
}

interface ServerRequest {
  method: Method;
  url: string;
  headers: Record<string, string>;
  data: string;
  buffer: Uint8Array;
}

type Interceptor = (req: ServerRequest) => Promise<Response>;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

class Server {
  private readonly listener: Deno.Listener;
  private readonly interceptor: Interceptor;
  private isClosed: boolean = false;
  private WAIT_FOR_NEXT_READ_TIMEOUT_MS = 15;
  private FIRST_READ_SIZE = 256;
  private BUFFER_STEP_SIZE = 1024;

  constructor(
    options: (Deno.ListenOptions | Deno.ListenTlsOptions),
    interceptor: Interceptor,
  ) {
    this.listener = Deno.listen(options);
    this.interceptor = interceptor;
    this.listenToRequests();
  }

  private async listenToRequests() {
    while (!this.isClosed) {
      const conn = await this.listener.accept();
      this.acceptRequest(conn);
    }
  }

  private convertToFinalResponseFormat(res: Response): Uint8Array {
    const formattedResponseHeaders = [];

    for (const headerName in res.headers) {
      formattedResponseHeaders.push(
        `${headerName}: ${res.headers[headerName]}`,
      );
    }

    for (const cookieName in res.cookies) {
      formattedResponseHeaders.push(
        `Set-Cookie: ${cookieName}=${res.cookies[cookieName]}`,
      );
    }

    if (res.redirect) {
      formattedResponseHeaders.push(`Location: ${res.redirect}`);
      res.statusCode ||= 301;
    }

    const encodedContent = res.content instanceof Uint8Array
      ? res.content
      : textEncoder.encode(res.content);

    let infoResultWithUncontrolledNewLines = textEncoder.encode(
      "HTTP/1.1 " + (res.statusCode || 200) + "\r\nServer: Aqua\r\n" +
        `Content-Length: ${encodedContent.byteLength}\r\n` +
        formattedResponseHeaders.join("\r\n"),
    );

    // If [-1] is a new line, remove it
    if (
      infoResultWithUncontrolledNewLines[
        infoResultWithUncontrolledNewLines.length - 1
      ] === 10
    ) {
      infoResultWithUncontrolledNewLines = infoResultWithUncontrolledNewLines
        .slice(0, infoResultWithUncontrolledNewLines.length - 1);
    }

    return new Uint8Array([
      ...infoResultWithUncontrolledNewLines,
      ...new Uint8Array([10, 10]),
      ...encodedContent,
    ]);
  }

  private parseHeaders({ info }: InterpretedServerRequest) {
    return info
      .slice(1)
      .reduce((headers: Record<string, string>, headerString) => {
        if (!headerString.includes(":")) return headers;
        const [headerName, headerValue] = headerString.split(":");
        headers[headerName] = decodeURIComponent(headerValue).trimLeft();
        return headers;
      }, {});
  }

  private parseHttpInfo(
    { info }: InterpretedServerRequest,
  ): { method: Method; url: string } {
    const [method, url] = info[0]?.split(" ");
    return { method, url } as { method: Method; url: string };
  }

  private interpretRequest(plainRequest: string): InterpretedServerRequest {
    const [infoString, ...data] = plainRequest.split(/(\n)(\r|)(\n)/);
    return {
      info: infoString.replace(/\r/g, "").split("\n"),
      data: data.join("").replace(/\x00|^((\r|)(\n|))*/g, ""),
    };
  }

  private async acceptRequest(conn: Deno.Conn) {
    let buffer: Uint8Array = new Uint8Array(this.FIRST_READ_SIZE);
    let lastReadSize = await conn.read(buffer) ?? 0;
    buffer = buffer.slice(0, lastReadSize);

    // Loaded full buffer, needs more space
    while (lastReadSize === this.FIRST_READ_SIZE) {
      const tempBuffer = new Uint8Array(this.FIRST_READ_SIZE);
      const readLength = await conn.read(tempBuffer) ?? 0;
      buffer = new Uint8Array([...buffer, ...tempBuffer.slice(0, readLength)]);
      lastReadSize = readLength;
    }

    let decodedRequest = textDecoder.decode(buffer);

    if (decodedRequest.match(/Content-Length/i)) {
      while (true) {
        const tempBuffer = new Uint8Array(this.BUFFER_STEP_SIZE);

        const readLength: number | undefined | null = await Promise.race([
          conn.read(tempBuffer),
          new Promise((resolve) =>
            setTimeout(resolve, this.WAIT_FOR_NEXT_READ_TIMEOUT_MS)
          ),
        ]) as number | undefined | null;

        if (!readLength) break;
        buffer = new Uint8Array([
          ...buffer,
          ...tempBuffer.slice(0, readLength),
        ]);
      }
      decodedRequest = textDecoder.decode(buffer);
    }

    if (buffer.length === 0) {
      await conn.write(
        textEncoder.encode("HTTP/1.1 400 Bad Request\r\nServer: Aqua"),
      );
      conn.close();
      return;
    }

    let interpretedRequest = this.interpretRequest(
      decodedRequest,
    );

    const httpInfo = this.parseHttpInfo(interpretedRequest);

    if (!httpInfo.url || !httpInfo.method) {
      await conn.write(
        textEncoder.encode("HTTP/1.1 400 Bad Request\r\nServer: Aqua"),
      );
      conn.close();
      return;
    }

    const headers = this.parseHeaders(interpretedRequest);

    const response = this.convertToFinalResponseFormat(
      await this.interceptor({
        ...httpInfo,
        headers,
        data: interpretedRequest.data,
        buffer,
      }),
    );

    await conn.write(
      response,
    );
    conn.close();
  }

  public close() {
    this.isClosed = true;
    this.listener.close();
  }
}

export default class Aqua {
  private readonly servers: Server[] = [];
  private routes: { [path: string]: StringRoute } = {};
  private regexRoutes: RegexRoute[] = [];
  private staticRoutes: StaticRoute[] = [];
  private options: Options = {};
  private middlewares: Middleware[] = [];
  private fallbackHandler: ResponseHandler | null = null;

  constructor(port: number, options?: Options) {
    const onlyTLS = (options?.tls && !options.tls.independentPort) ||
      options?.tls?.independentPort === port;

    if (options?.tls) {
      this.servers.push(
        new Server({
          hostname: options.tls.hostname || "localhost",
          certFile: options.tls.certFile || "./localhost.crt",
          keyFile: options.tls.keyFile || "./localhost.key",
          port: options.tls.independentPort || port,
        }, this.handleServerRequest.bind(this)),
      );
    }

    if (!onlyTLS) {
      this.servers.push(
        new Server({ port }, this.handleServerRequest.bind(this)),
      );
    }

    this.options = options || {};
    if (this.options.log) {
      console.log(`Server started (http://localhost:${port})`);
    }
  }

  public async render(filePath: string): Promise<string> {
    try {
      return textDecoder.decode(await Deno.readFile(filePath));
    } catch (error) {
      if (error instanceof Deno.errors.PermissionDenied) {
        return "Please run your application with the '--allow-read' flag.";
      }

      return "Could not render file.";
    }
  }

  private async parseBody(
    req: ServerRequest,
  ): Promise<{
    body: { [name: string]: string };
    files: { [name: string]: File };
  }> {
    if (!req.data) return { body: {}, files: {} };

    const { buffer, data: textData } = req;
    let body: { [name: string]: string } = {};

    const files: { [name: string]: File } = (
      textData.match(
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

      const uniqueStringEncoded = textEncoder.encode(uniqueString);
      const endSequence = textEncoder.encode("----");

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
      body = JSON.parse(textData);
    } catch (error) {
      if (textData.includes(`name="`)) {
        body = (
          textData.match(/name="(.*?)"(\s|\n|\r)*(.*)(\s|\n|\r)*---/gm) || []
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
        body = Object.fromEntries(new URLSearchParams(textData));
      }
    }

    return { body, files };
  }

  private parseQuery(req: ServerRequest): { [name: string]: string } {
    if (!req.url.includes("?")) return {};

    return Object.fromEntries(
      new URLSearchParams(req.url.replace(/(.*)\?/, "")),
    );
  }

  private parseCookies(cookieHeaderValue: string): Record<string, string> {
    if (!cookieHeaderValue) return {};

    return cookieHeaderValue.split(";").reduce((cookies: {}, cookie: string): {
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

  private async getResponseAfterApplyingMiddlewares(
    req: Request,
    res: Response,
  ): Promise<Response> {
    let responseAfterMiddlewares: Response = res;
    for (const middleware of this.middlewares) {
      responseAfterMiddlewares = await middleware(
        req,
        responseAfterMiddlewares,
      );
    }
    return responseAfterMiddlewares;
  }

  private async respondToRequest(
    req: Request,
    requestedPath: string,
    route: StringRoute | RegexRoute | StaticRoute,
    additionalResponseOptions: {
      usesURLParameters?: boolean;
      customResponseHandler?: ResponseHandler | undefined;
    } = { usesURLParameters: false, customResponseHandler: undefined },
  ): Promise<Response> {
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
        return await this.respondWithNoRouteFound(req);
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
        return await this.respondWithNoRouteFound(req);
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
      return { content: "No response content provided" };
    }

    return await this.getResponseAfterApplyingMiddlewares(
      req,
      formattedResponse,
    );
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

  private async respondWithNoRouteFound(req: Request): Promise<Response> {
    return await this.getFallbackHandlerResponse(req);
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

  private async handleServerRequest(
    serverRequest: ServerRequest,
  ): Promise<Response> {
    if (this.options.ignoreTrailingSlash) {
      serverRequest.url = serverRequest.url.replace(/\/$/, "") + "/";
    }

    const { body, files } = await this.parseBody(serverRequest);
    const req: Request = {
      url: serverRequest.url,
      headers: serverRequest.headers,
      method: serverRequest.method,
      query: serverRequest.url.includes("?")
        ? this.parseQuery(serverRequest)
        : {},
      body,
      files,
      cookies: serverRequest.headers["Cookie"]
        ? this.parseCookies(serverRequest.headers["Cookie"])
        : {},
      parameters: {},
      matches: [],
    };
    const requestedPath = Router.parseRequestPath(req.url);

    if (this.options.log) {
      console.log(
        `\x1b[33m${req.method} \x1b[0m(\x1b[36mIncoming\x1b[0m) \x1b[0m${requestedPath}\x1b[0m`,
      );
    }

    if (!this.routes[req.method + requestedPath]) {
      const matchingRouteWithURLParameters = Router
        .findRouteWithMatchingURLParameters(
          requestedPath,
          this.routes,
        );

      if (matchingRouteWithURLParameters) {
        return await this.respondToRequest(
          req,
          requestedPath,
          matchingRouteWithURLParameters,
          { usesURLParameters: true },
        );
      }

      const matchingRegexRoute = Router.findMatchingRegexRoute(
        requestedPath,
        this.regexRoutes,
      );

      if (matchingRegexRoute) {
        return await this.respondToRequest(
          req,
          requestedPath,
          matchingRegexRoute as RegexRoute,
        );
      }

      if (req.method === "GET") {
        const matchingStaticRoute = Router.findMatchingStaticRoute(
          requestedPath,
          this.staticRoutes,
        );

        if (matchingStaticRoute) {
          return await this.respondToRequest(
            req,
            requestedPath,
            matchingStaticRoute,
          );
        }
      }

      return await this.respondWithNoRouteFound(req);
    } else {
      return await this.respondToRequest(
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

  public register(middleware: Middleware): Aqua {
    this.middlewares.push(middleware);
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

  public close() {
    for (const server of this.servers) {
      try {
        server.close();
      } catch {}
    }
  }
}
