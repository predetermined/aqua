import { serve, Server, ServerRequest } from "https://deno.land/std@v0.42.0/http/server.ts";

type Routes = {
    [key: string]: (req: ServerRequest) => any;
}

type Options = {
    ignoreTailingSlash?: boolean;
}

export default class Aqua {
    private readonly server: Server;
    private routes: Routes = {};
    private options: Options = {};

    constructor(port: number, options?: Options) {
        this.server = serve({ port });
        this.options = options || {};

        this.handleRequests();
    }

    private async handleRequests() {
        for await (const req of this.server) {
            if (this.options.ignoreTailingSlash) req.url = req.url.replace(/\/$/, "") + "/";

            if (!this.routes[req.method + req.url]) {
                req.respond({ body: "No registered route found." });
            }else {
                await this.routes[req.method + req.url](req);
            }
        }
    }

    public route(path: string, method: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH", callback: (req: ServerRequest) => any) {
        if (!path.startsWith("/")) {
            console.warn("Routes must start with a slash");
            return;
        }

        if (this.options.ignoreTailingSlash) path = path.replace(/\/$/, "") + "/";

        if (this.routes[method + path]) {
            console.error(`The route ${path} (method: ${method}) has already been declared.`);
            return;
        }

        this.routes[method + path] = callback;
        return this;
    }
}