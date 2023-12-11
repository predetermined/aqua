export interface Event {
  request: Request;
  response: Response;
  /**
   * Calling `end()` tells Aqua to respond to the event after running the
   * current step function.
   * Please make sure to return after calling `end()` to not accidentally modify
   * the event response any further.
   *
   * @example
   * .step((event) => {
   *   if (event.request.headers.has("early-return")) {
   *     event.response = Response.json({ data: {} });
   *     return event.end();
   *   }
   * });
   */
  end(): void;
  [key: string]: unknown;
}

export interface InternalEvent extends Event {
  _internal: {
    urlPatternResult: null | URLPatternResult;
    hasCalledEnd: boolean;
  };
}

export type InternalizedEvent<_Event extends Event> = _Event & InternalEvent;
