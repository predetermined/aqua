export class ResponseError extends Error {
  constructor(
    public readonly body?: BodyInit,
    public readonly init?: ResponseInit
  ) {
    super(typeof body === "string" ? body : "");
    this.name = "ResponseError";
  }
}
