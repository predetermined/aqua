import OriginalAqua, { Options as OriginalOptions } from "./aqua.ts";
import { getAquaRequestFromNativeRequest } from "./shared.ts";

export * from "./aqua.ts";

declare var addEventListener: (
  eventName: string,
  handler: (event: Deno.RequestEvent) => void,
) => void;

export type Options = Omit<OriginalOptions, "tls">;

export default class Aqua extends OriginalAqua {
  public _internal = {
    mockRequest: this.mockRequest.bind(this),
  };

  private async mockRequest(event: Deno.RequestEvent) {
    const req = await getAquaRequestFromNativeRequest(event);
    this.handleRequest(req);
  }

  constructor(options?: Options) {
    super(-1, { ...options });
  }

  protected listen(_port: number) {
    addEventListener("fetch", async (event) => {
      const req = await getAquaRequestFromNativeRequest(event);
      this.handleRequest(req);
    });
  }
}
