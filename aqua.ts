import {
  getAquaRequestFromNativeRequest,
  Json,
} from "./shared.ts";
import {
  findRouteWithMatchingURLParameters,
  parseRequestPath,
} from "./helpers/routing.ts";
import { getContentType } from "./helpers/content_identification.ts";
import {Branch} from "./branch";

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

type ResponseContent =
    | Uint8Array
    | Blob
    | BufferSource
    | FormData
    | URLSearchParams
    | ReadableStream<Uint8Array>
    | string;

interface AquaContentResponse {
  statusCode?: number;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  redirect?: string;
  content: ResponseContent;
}

export type AquaResponseObject = AquaContentResponse;
export type AquaResponse = ResponseContent | AquaResponseObject;

export interface AquaRequest {
  _internal: {
    respond(res: AquaResponseObject): void;
    requestedPath: string;
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

type ResponseHandler = (req: AquaRequest) => AquaResponse | Promise<AquaResponse>;

export interface Route {
  path: string;
  method: Method;
  usesURLParameters: boolean;
  urlParameterRegex?: RegExp;
}

export interface Options {
  port: number;
  ignoreTrailingSlash?: boolean;
  log?: boolean;
  tls?: {
    independentPort?: number;
    hostname?: string;
    certFile: string;
    keyFile: string;
  };
}

export type RoutingSchemaValidationFunction<Context> = (
    this: Context,
    context: Context,
) => boolean | Promise<boolean>;

type RoutingSchemaKeys =
    | "body"
    | "query"
    | "cookies"
    | "parameters"
    | "headers";

type RoutingSchema = {
  [requestKey in RoutingSchemaKeys]?: RoutingSchemaValidationFunction<
      AquaRequest[requestKey]
      >[];
};

const NOT_FOUND_RESPONSE = { statusCode: 404, content: "Not found." };

export default class Aqua {
  private branches: Record<string, Branch> = {};

  constructor(protected readonly options: Options) {
    this.listen(options.port, {
      onlyTls: (options?.tls && !options.tls.independentPort) ||
          options?.tls?.independentPort === options.port,
    });

    if (this.options.log) {
      console.log(`Server started (http://localhost:${options.port})`);
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

  private convertResponseToResponseObject(response: AquaResponse): AquaResponseObject {
    if (typeof response === "object" && "content" in response) {
      return response;
    }

      return {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
        content: response,
      };
  }

  private async respondToRequest(
      req: AquaRequest,
      branch: Branch
  ) {
    // @TODO: implement
  }

  protected async handleRequest(req: AquaRequest) {
    if (this.options.ignoreTrailingSlash) {
      req.url = req.url.replace(/\/$/, "") + "/";
    }

    const requestedPath = parseRequestPath(req.url);

    if (this.options.log) {
      console.log(
          `\x1b[33m${req.method} \x1b[0m(\x1b[36mIncoming\x1b[0m) \x1b[0m${requestedPath}\x1b[0m`,
      );
    }

    if (this.branches[req.method + requestedPath]) {
      this.respondToRequest(
          req,
          this.branches[req.method + requestedPath],
      );
      return;
    }

    // @TODO: handle routes with path parameters

    req._internal.respond({
      content: "Oh no!"
    })
  }

  public route(
      path: string,
      method: Method,
  ): Branch {
    if (!path.startsWith("/")) throw Error("Routes must start with a slash");
    if (this.options.ignoreTrailingSlash) path = path.replace(/\/$/, "") + "/";

    const usesURLParameters = /:[a-zA-Z_]/.test(path);

    const req: Route = {
      path,
      usesURLParameters,
      urlParameterRegex: usesURLParameters
          ? new RegExp(path.replace(/:([a-zA-Z0-9_]*)/g, "([^/]*)"))
          : undefined,
      method,
    };

    const branch = new Branch(req);
    this.branches[method.toUpperCase() + path] = branch;
    return branch;
  }
}
