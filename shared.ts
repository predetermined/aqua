import {
  Response as ServerResponse,
  serve,
  Server,
  ServerRequest as FullServerRequest,
  serveTLS,
} from "https://deno.land/std@0.102.0/http/server.ts";

export type ServerRequest = Pick<
  FullServerRequest,
  "url" | "method" | "headers" | "body" | "respond" | "contentLength"
>;
export type { ServerResponse };

export { Buffer } from "https://deno.land/std@0.102.0/io/buffer.ts";
export { serve, Server, serveTLS };
