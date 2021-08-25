import type { RegexRoute, StaticRoute, StringRoute } from "../aqua.ts";

export function parseRequestPath(url: string) {
  return url.replace(/(\?(.*))|(\#(.*))/, "");
}

export function findRouteWithMatchingURLParameters(
  requestedPath: string,
  routes: { [path: string]: StringRoute },
): StringRoute | undefined {
  return routes[
    Object.keys(routes).find((path: string) => {
      if (!path.includes(":")) return false;
      const route: StringRoute = routes[path];

      return requestedPath.replace(route.urlParameterRegex as RegExp, "")
        .length === 0;
    }) || ""
  ];
}

export function findMatchingRegexRoute(
  requestedPath: string,
  regexRoutes: RegexRoute[],
): RegexRoute | undefined {
  return regexRoutes.find((regexRoute: RegexRoute) => {
    return requestedPath.replace(regexRoute.path, "").length === 0;
  });
}

export function findMatchingStaticRoute(
  requestedPath: string,
  staticRoutes: StaticRoute[],
): StaticRoute | undefined {
  return staticRoutes.find((staticRoute) =>
    requestedPath.startsWith(staticRoute.path)
  );
}
