import {
  Method,
  Request as AquaRequest,
  Response as AquaResponse,
} from "./aqua.ts";
import { parseBody, parseCookies, parseQuery } from "./helpers/parsing.ts";

import {
  serve,
  Server,
  ServerRequest,
  serveTLS,
} from "https://deno.land/std@0.103.0/http/server.ts";

export { serve, Server, serveTLS };

export type Json =
  | null
  | string
  | number
  | boolean
  | Json[]
  | { [name: string]: Json };

export const textDecoder = new TextDecoder();
export const textEncoder = new TextEncoder();

export function getFinalizedHeaders(res: AquaResponse): Headers {
  const headers: Headers = new Headers(res.headers || {});

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

export function getFinalizedStatusCode(res: AquaResponse): number {
  let statusCode: number | undefined = res.statusCode;

  if (res.redirect) {
    statusCode ||= 301;
  }

  return statusCode || 200;
}

export async function getAquaRequestFromNativeRequest(
  { request: req, respondWith }: Deno.RequestEvent,
  conn?: Deno.Conn,
): Promise<AquaRequest> {
  const url = new URL(req.url).pathname;
  const { body, files } = parseBody(
    new Uint8Array(await req.arrayBuffer()),
  ) ?? { body: {}, files: {} };

  return {
    _internal: {
      respond(res: AquaResponse) {
        respondWith(
          new Response(res.content, {
            status: getFinalizedStatusCode(res),
            headers: getFinalizedHeaders(res),
          }),
        );
      },
      raw: req,
    },
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

export async function getAquaRequestFromHttpServerRequest(
  req: ServerRequest,
): Promise<AquaRequest> {
  const { body, files } = req.contentLength
    ? parseBody(await Deno.readAll(req.body))
    : { body: {}, files: {} };

  return {
    _internal: {
      respond(res: AquaResponse) {
        req.respond({
          body: res.content,
          headers: getFinalizedHeaders(res),
          status: getFinalizedStatusCode(res),
        });
      },
      raw: req,
    },
    url: req.url,
    body,
    files,
    method: req.method.toUpperCase() as Method,
    headers: Object.fromEntries(req.headers),
    query: req.url.includes("?") ? parseQuery(req.url) : {},
    cookies: req.headers.get("cookies") ? parseCookies(req.headers) : {},
    parameters: {},
    matches: [],
    conn: req.conn,
  };
}
