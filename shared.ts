import {
  Method,
  Request as AquaRequest,
  ResponseObject as AquaResponseObject,
} from "./aqua.ts";
import { parseBody, parseCookies, parseQuery } from "./helpers/parsing.ts";

export type Json =
  | null
  | string
  | number
  | boolean
  | Json[]
  | { [name: string]: Json };

export const textDecoder = new TextDecoder();
export const textEncoder = new TextEncoder();

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

export async function getAquaRequestFromNativeRequest(
  event: Deno.RequestEvent,
  conn?: Deno.Conn,
): Promise<AquaRequest> {
  const { request: req } = event;
  const url = new URL(req.url).pathname;
  const { body, files } = parseBody(
    new Uint8Array(await req.arrayBuffer()),
  ) ?? { body: {}, files: {} };

  return {
    _internal: {
      respond(res) {
        event.respondWith(
          new Response(res.content, {
            status: res.redirect
              ? res.statusCode || 301
              : res.statusCode || 200,
            headers: getFinalizedHeaders(res),
          }),
        );
      },
    },
    raw: req,
    url,
    body,
    files,
    method: req.method.toUpperCase() as Method,
    headers: Object.fromEntries(req.headers),
    query: req.url.includes("?") ? parseQuery(req.url) : {},
    cookies: req.headers.get("cookies") ? parseCookies(req.headers) : {},
    parameters: {},
    matches: [],
    conn,
  };
}
