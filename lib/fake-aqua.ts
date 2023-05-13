import { Aqua, AquaOptions } from "./aqua.ts";

export class FakeAqua extends Aqua {
  constructor(options: AquaOptions = {}) {
    super(options);
  }

  protected async listen() {}

  public async fakeCall(request: Request): Promise<Response> {
    return await this.handleRequest(this.createInternalEvent(request));
  }
}
