import { Buffer } from "https://deno.land/std@0.102.0/io/buffer.ts";
import OriginalAqua, {
  Method,
  Options as OriginalOptions,
  Request as AquaRequest,
  Response,
  ServerRequest,
  ServerResponse,
} from "./aqua.ts";

declare var addEventListener: (
  eventName: string,
  handler: (event: FetchEvent) => void,
) => void;
1
declare var Response: {
  new (
    body: string | Uint8Array | any,
    options: { status?: number; headers?: Headers },
  ): any;
};

export type Options = Omit<OriginalOptions, "tls">;

export interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Response): void;
}

export default class Aqua extends OriginalAqua {
  public _experimental = {
    parseRequest: this.parseRequest.bind(this),
  };

  constructor(options?: Options) {
    super(-1, { ...options, _experimental: { skipServing: true } });
  }

  protected async parseRequest(event: FetchEvent): Promise<AquaRequest> {
    const eventReq = event.request;
    const bodyBuffer = new Uint8Array(await eventReq.arrayBuffer());

    const serverRequest: ServerRequest = {
      async respond(res: ServerResponse) {
        event.respondWith(
          new Response(res.body, { status: res.status, headers: res.headers }),
        );
      },
      url: new URL(eventReq.url).pathname,
      method: eventReq.method,
      headers: eventReq.headers,
      body: new Buffer(bodyBuffer),
      contentLength: bodyBuffer.byteLength,
    };

    const { body, files } = await super.parseBody(bodyBuffer);

    return {
      raw: serverRequest,
      url: serverRequest.url,
      method: serverRequest.method.toUpperCase() as Method,
      headers: Object.fromEntries(serverRequest.headers),
      query: super.parseQuery(serverRequest.url),
      cookies: super.parseCookies(serverRequest.headers),
      matches: [],
      parameters: {},
      body,
      files,
    };
  }

  protected spinUpServers() {
    addEventListener("fetch", (event: FetchEvent) => {
      this.handleRequest(event);
    });
  }
}
