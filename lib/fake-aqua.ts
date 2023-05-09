import { Aqua, AquaOptions, getDefaultResponse } from "./aqua.ts";

export class FakeAqua extends Aqua {
  constructor(options: AquaOptions = {}) {
    super(options);
  }

  public async fakeCall(request: Request): Promise<Response> {
    return await new Promise((resolve) => {
      this.handleRequest({
        _internal: {
          hasCalledEnd: false,
        },
        request,
        response: getDefaultResponse(),
        end() {
          if (this._internal.hasCalledEnd) return;
          this._internal.hasCalledEnd = true;

          resolve(this.response);
        },
      });
    });
  }
}
