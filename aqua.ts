import { serve, Server, ServerRequest } from "https://deno.land/std@v0.42.0/http/server.ts";

type Method = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH";

type Request = {
    raw: ServerRequest;
    url: string;
    method: Method;
    headers: Headers;
    query: {};
    body: {};
    cookies: {};
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

    private async parseBody(req: ServerRequest): Promise<{}> {
        const buffer: Uint8Array = new Uint8Array(req.contentLength || 0);
        const lengthRead: number = await req.body.read(buffer) || 0;
        const rawBody: string | object = new TextDecoder().decode(buffer.subarray(0, lengthRead));
        let body: {} = {};

        try {
            body = JSON.parse(rawBody.toString());
        }catch(error) {
            if (rawBody.toString().includes(`name="`)) {
                body = (rawBody.toString().match(/name="(.*?)"(\s|\n|\r)*(.*)(\s|\n|\r)*---/gm) || [])
                .reduce((fields: object, field: string): object => {
                    if (!/name="(.*?)"/.exec(field)?.[1]) return fields;

                    return {
                        ...fields,
                        [/name="(.*?)"/.exec(field)?.[1] || ""]: field.match(/(.*?)(?=(\s|\n|\r)*---)/)?.[0]
                    }
                }, {});
            }
        }

        return body;
    }

    parseQuery(req: ServerRequest): {} {
        const queryURL = req.url.replace(/(.*)\?/, "");
        const queryString = queryURL.split("&");

        return queryString.reduce((queries: object, query: string): object => {
            if (!query)
                return queries;

            return {
                ...queries,
                [query.split("=")?.[0]]: query.split("=")?.[1]
            }
        }, {}) || {};
    }

    private parseCookies(req: ServerRequest): {} {
        const rawCookieString = req.headers.get("cookie");

        return rawCookieString && rawCookieString.split(";").reduce((cookies: any, cookie: string): any => {
            return {
                ...cookies,
                [cookie.split("=")[0].trimLeft()]: cookie.split("=")[1]
            };
        }, {}) || {};
    }

    private async handleRequests() {
        for await (const req of this.server) {
            if (this.options.ignoreTrailingSlash) req.url = req.url.replace(/\/$/, "") + "/";

            const routingPath = req.url.replace(/(\?(.*))|(\#(.*))/, "");

            if (!this.routes[req.method + routingPath]) {
                req.respond({ status: 404, body: "No registered route found." });
            }else {
                const userFriendlyRequest: Request = {
                    raw: req,
                    url: req.url,
                    headers: req.headers,
                    method: (req.method as Method),
                    query: this.parseQuery(req),
                    body: await this.parseBody(req),
                    cookies: this.parseCookies(req),
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
                }, await this.routes[req.method + routingPath](userFriendlyRequest));

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

        this.routes[method + path] = callback;
        return this;
    }

    public get(path: string, callback: (req: Request) => any) {
        this.route(path, "GET", callback);
    }

    public post(path: string, callback: (req: Request) => any) {
        this.route(path, "POST", callback);
    }
}