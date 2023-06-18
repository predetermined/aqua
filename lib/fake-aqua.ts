import { Aqua, AquaOptions } from "./aqua.ts";

export class FakeAqua extends Aqua {
  constructor(options: AquaOptions = {}) {
    super(options);
  }

  protected async listen() {}

  public async fakeCall(request: Request): Promise<Response> {
    try {
      return await this.handleRequest(this.createInternalEvent(request));
    } catch (error) {
      return new Response(error, { status: 500 });
    }
  }
}
