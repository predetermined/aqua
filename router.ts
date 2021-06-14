import type { RegexRoute, StaticRoute, StringRoute } from "./aqua.ts";

export default class Router {
  public static parseRequestPath(url: string) {
    return url.replace(/(\?(.*))|(\#(.*))/, "");
  }

  public static findRouteWithMatchingURLParameters(
    requestedPath: string,
    routes: { [path: string]: StringRoute },
  ) {
    return routes[
      Object.keys(routes).find((path: string) => {
        if (!path.includes(":")) return false;
        const route: StringRoute = routes[path];

        return requestedPath.replace(route.urlParameterRegex as RegExp, "")
          .length === 0;
      }) || ""
    ];
  }

  public static findMatchingRegexRoute(
    requestedPath: string,
    regexRoutes: RegexRoute[],
  ) {
    return regexRoutes.find((regexRoute: RegexRoute) => {
      return requestedPath.replace(regexRoute.path, "").length === 0;
    });
  }

  public static findMatchingStaticRoute(
    requestedPath: string,
    staticRoutes: StaticRoute[],
  ) {
    return staticRoutes.find((staticRoute) =>
      requestedPath.startsWith(staticRoute.path)
    );
  }
}
