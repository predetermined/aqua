import { Aqua, AquaOptions } from "./aqua.ts";
import { ResponseError } from "./response-error.ts";

export class FakeAqua extends Aqua {
  constructor(options: AquaOptions = {}) {
    super(options);
  }

  protected async listen() {}

  public async fakeCall(request: Request): Promise<Response> {
    try {
      return await this.handleRequest(this.createInternalEvent(request));
    } catch (error) {
      if (error instanceof ResponseError) {
        return error.response;
      }

      return new Response(error, { status: 500 });
    }
  }
}
