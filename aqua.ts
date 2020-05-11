import { serve, Server, ServerRequest } from "https://deno.land/std@v0.42.0/http/server.ts";

type Method = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH";

type Request = {
    url: string;
    method: Method;
    headers: Headers;
    _responseHeaders: Headers;
    _responseStatusCode: number;
    setStatusCode(statusCode: number): void;
    setHeader(name: string, value: string): void;
    setCookie(name: string, value: string): void;
};

type Routes = {
    [key: string]: (req: Request) => any;
}

type Options = {
    ignoreTrailingSlash?: boolean;
}

type Middleware = (req: ServerRequest, respondValue: string) => string;

export default class Aqua {
    private readonly server: Server;
    private routes: Routes = {};
    private options: Options = {};
    private middlewares: Middleware[] = [];

    constructor(port: number, options?: Options) {
        this.server = serve({ port });
        this.options = options || {};

        this.handleRequests();
    }

    private async handleRequests() {
        for await (const req of this.server) {
            if (this.options.ignoreTrailingSlash) req.url = req.url.replace(/\/$/, "") + "/";

            if (!this.routes[req.method + req.url]) {
                req.respond({ body: "No registered route found." });
            }else {
                const userFriendlyRequest: Request = {
                    url: req.url,
                    headers: req.headers,
                    method: (req.method as Method),
                    _responseHeaders: new Headers(),
                    _responseStatusCode: 200,
                    setStatusCode(statusCode: number) {
                        this._responseStatusCode = statusCode;
                    },
                    setHeader(name: string, value: string) {
                        this._responseHeaders.append(name, value);
                    },
                    setCookie(name: string, value: string) {
                        this._responseHeaders.append("Set-Cookie", `${name}=${value}`);
                    }
                }

                const respondValue = this.middlewares.reduce((respondValue: string, middleware: Middleware): string => {
                    return middleware(req, respondValue);
                }, await this.routes[req.method + req.url](userFriendlyRequest));

                req.respond({ status: userFriendlyRequest._responseStatusCode, headers: userFriendlyRequest._responseHeaders, body: respondValue });
            }
        }
    }

    public register(middleware: Middleware) {
        this.middlewares.push(middleware);
    }

    public route(path: string, method: Method, callback: (req: Request) => any) {
        if (!path.startsWith("/")) {
            console.warn("Routes must start with a slash");
            return;
        }

        if (this.options.ignoreTrailingSlash) path = path.replace(/\/$/, "") + "/";

        if (this.routes[method + path]) {
            console.error(`The route ${path} (method: ${method}) has already been declared.`);
            return;
        }

        this.routes[method + path] = callback;
        return this;
    }
}