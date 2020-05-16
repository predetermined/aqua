import { serve, Server, ServerRequest } from "https://deno.land/std@v0.42.0/http/server.ts";
import Router from "./router.ts";

type ResponseHandler = (req: Request) => any;
type Method = "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH";
type Middleware = (req: Request, response: Response) => Response;
type RawResponse = string | Response;

interface Response {
    statusCode?: number;
    headers?: { [name: string]: string; };
    cookies?: { [name: string]: string; };
    content: string;
};

export interface Request {
    raw: ServerRequest;
    url: string;
    method: Method;
    headers: Headers;
    query: {};
    body: {};
    cookies: {};
    parameters: { [parameter: string]: string; };
};

export interface Route {
    path: string;
    usesURLParameters: boolean;
    urlParameterRegex?: RegExp;
    responseHandler: ResponseHandler;
};

export interface Options {
    ignoreTrailingSlash?: boolean;
};

export default class Aqua {
    private readonly server: Server;
    private routes: { [path: string]: Route } = {};
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
        const rawBody: string = new TextDecoder().decode(buffer.subarray(0, lengthRead));
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

    private parseQuery(req: ServerRequest): {} {
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

    private connectURLParameters(route: Route, requestedPath: string): {} {
        return route.path.match(/:([a-zA-Z0-9_]*)/g)?.reduce((storage: { urlParameters: any; currentRequestedPath: string; }, urlParameterWithColon: string) => {
            const urlParameter = urlParameterWithColon.replace(":", "");
            const partTillParameter = route.path.split(urlParameterWithColon)[0];
            const urlParameterValue = storage.currentRequestedPath.replace(
                new RegExp(partTillParameter.replace(/:([a-zA-Z0-9_]*)/, ".*?")),
                ""
            ).match(/([a-zA-Z0-9_]*)/g)?.[0];
            const currentRequestedPath = storage.currentRequestedPath.replace(/:([a-zA-Z0-9_]*)/, "");

            return {
                urlParameters: {
                    ...storage.urlParameters,
                    [urlParameter]: urlParameterValue
                },
                currentRequestedPath
            };
        }, { urlParameters: {}, currentRequestedPath: requestedPath }).urlParameters;
    }

    private async respondToRequest(req: ServerRequest, requestedPath: string, route: Route, usesURLParameters: boolean = false) {
        const connectedURLParameters = usesURLParameters ? this.connectURLParameters(route, requestedPath) : {};

        if (Object.values(connectedURLParameters).find((parameterValue) => parameterValue === "") !== undefined) {
            req.respond({ status: 404, body: "No registered route found." });
            return;
        }

        const userFriendlyRequest: Request = {
            raw: req,
            url: req.url,
            headers: req.headers,
            method: (req.method as Method),
            query: this.parseQuery(req),
            body: await this.parseBody(req),
            cookies: this.parseCookies(req),
            parameters: connectedURLParameters
        }

        const rawResponse: RawResponse = await route.responseHandler(userFriendlyRequest);
        const formattedResponse: Response = typeof rawResponse === "string" ? { content: rawResponse } : rawResponse;

        if (!formattedResponse.content) return;

        const responseAfterMiddlewares: Response = this.middlewares.reduce((currentResponse: Response, middleware: Middleware): Response => {
            if (!currentResponse) return currentResponse;

            return middleware(userFriendlyRequest, currentResponse);
        }, formattedResponse);
        const headers: Headers = new Headers(formattedResponse.headers || {});

        if (formattedResponse.cookies) {
            for (const cookieName of Object.keys(formattedResponse.cookies))
                headers.append("Set-Cookie", `${cookieName}=${formattedResponse.cookies[cookieName]}`);
        }

        req.respond({
            headers,
            status: responseAfterMiddlewares.statusCode,
            body: responseAfterMiddlewares.content
        });
    }

    private async handleRequests() {
        for await (const req of this.server) {
            if (this.options.ignoreTrailingSlash) req.url = req.url.replace(/\/$/, "") + "/";

            const requestedPath = Router.parseRequestPath(req.url);

            if (!this.routes[req.method + requestedPath]) {
                const matchingRouteWithURLParameters = Router.findRouteWithMatchingURLParameters(requestedPath, this.routes);

                if (matchingRouteWithURLParameters) {
                    await this.respondToRequest(req, requestedPath, matchingRouteWithURLParameters, true);
                }else {
                    req.respond({ status: 404, body: "No registered route found." });
                }
            }else {
                await this.respondToRequest(req, requestedPath, this.routes[req.method + requestedPath]);
            }
        }
    }

    public register(middleware: Middleware) {
        this.middlewares.push(middleware);
        return this;
    }

    public route(path: string, method: Method, responseHandler: (req: Request) => RawResponse) {
        if (!path.startsWith("/")) {
            console.warn("Routes must start with a slash");
            return;
        }

        if (this.options.ignoreTrailingSlash) path = path.replace(/\/$/, "") + "/";

        const usesURLParameters = /:[a-zA-Z]/.test(path);

        this.routes[method + path] = {
            path,
            usesURLParameters,
            urlParameterRegex: usesURLParameters ? new RegExp(path.replace(/:([a-zA-Z0-9_]*)/g, "([^\/]*)")) : undefined,
            responseHandler
        };
        return this;
    }

    public get(path: string, callback: (req: Request) => RawResponse) {
        this.route(path, "GET", callback);
        return this;
    }

    public post(path: string, callback: (req: Request) => RawResponse) {
        this.route(path, "POST", callback);
        return this;
    }
}