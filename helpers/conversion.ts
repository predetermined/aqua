import { Method, Request as AquaRequest } from "../aqua.ts";
import { parseBody, parseCookies, parseQuery } from "./parsing.ts";
import {
  getFinalizedHeaders,
  getFinalizedStatusCode,
} from "./response_building.ts";

export async function getAquaRequestFromNativeRequest(
  event: Deno.RequestEvent,
  conn?: Deno.Conn,
): Promise<AquaRequest> {
  const { request: req } = event;
  const url = new URL(req.url).pathname;
  const payload = new Uint8Array(await req.arrayBuffer());

  const aquaReq: AquaRequest = {
    _internal: {
      parsedBody: null,
      respond(res) {
        event.respondWith(
          new Response(res.content, {
            status: getFinalizedStatusCode(res, 200),
            headers: getFinalizedHeaders(res),
          }),
        );
      },
    },
    raw: req,
    url,
    method: req.method.toUpperCase() as Method,
    parameters: {},
    matches: [],
    conn,
    custom: {},
    get body() {
      if (!this._internal.parsedBody) {
        this._internal.parsedBody = parseBody(
          payload,
        ) ?? { body: {}, files: {} };
      }

      return this._internal.parsedBody.body;
    },
    get files() {
      if (!this._internal.parsedBody) {
        this._internal.parsedBody = parseBody(
          payload,
        ) ?? { body: {}, files: {} };
      }

      return this._internal.parsedBody.files;
    },
    get headers() {
      return Object.fromEntries(req.headers);
    },
    get query() {
      return req.url.includes("?") ? parseQuery(req.url) : {};
    },
    get cookies() {
      return req.headers.get("cookies") ? parseCookies(req.headers) : {};
    },
  };

  return aquaReq;
}
