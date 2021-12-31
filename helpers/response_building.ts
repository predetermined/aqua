import { ResponseObject as AquaResponseObject } from "../aqua.ts";

export function getFinalizedStatusCode(
  res: AquaResponseObject,
  fallbackStatusCode: number,
): number {
  return res.redirect
    ? res.statusCode ?? 301
    : res.statusCode ?? fallbackStatusCode;
}

export function getFinalizedHeaders(res: AquaResponseObject): Headers {
  const headers = new Headers(res.headers || {});

  if (res.cookies) {
    for (const cookieName of Object.keys(res.cookies)) {
      headers.append("Set-Cookie", `${cookieName}=${res.cookies[cookieName]}`);
    }
  }

  if (res.redirect) {
    headers.append("Location", res.redirect);
  }

  return headers;
}
