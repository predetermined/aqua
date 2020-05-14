import { Route } from "./aqua.ts";

export default class Router {
    public static parseRequestPath(url: string) {
        return url.replace(/(\?(.*))|(\#(.*))/, "");
    };

    public static findRouteWithMatchingURLParameters(requestedPath: string, routes: { [path: string]: Route }) {
        return routes[Object.keys(routes).find((path: string) => {
            if (!path.includes(":")) return false;
            const route: Route = routes[path];

            return requestedPath.replace(route.urlParameterRegex as RegExp, "").length === 0;
        }) || ""];
    }
}