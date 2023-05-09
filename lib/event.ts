export interface Event {
  request: Request;
  response: Response;
  /**
   * Responds to the event with the currently set `response`.
   * This function should not be called multiple times.
   * @todo Is there maybe a way to allow no statements after this fn has been called?
   */
  end(): void;
  [key: string]: unknown;
}

export interface InternalEvent extends Event {
  _internal: {
    hasCalledEnd: boolean;
  };
}

export type InternalizedEvent<_Event extends Event> = _Event & InternalEvent;
