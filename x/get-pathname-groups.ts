import { Event, InternalizedEvent } from "../mod.ts";

export function getPatternPathnameGroups<_Event extends Event>(event: _Event) {
  const internalEvent = event as InternalizedEvent<_Event>;

  const groups = new Map();
  for (const [name, value] of Object.entries(
    internalEvent._internal.urlPatternResult?.pathname?.groups ?? {}
  )) {
    groups.set(name, value);
  }

  return groups;
}
