import { Aqua, RespondFn, RouteOptions, StepFn } from "./aqua.ts";
import { Event } from "./event.ts";
import { Method } from "./method.ts";

export interface BranchOptions<_Event extends Event>
  extends Required<Pick<RouteOptions<_Event>, "steps">> {
  path: string;
  aquaInstance: Aqua;
}

interface BranchInternals<_Event extends Event> {
  options: BranchOptions<_Event>;
  path: string;
}

export class Branch<_Event extends Event> {
  private steps: StepFn<_Event>[] = [];

  public _internal: BranchInternals<_Event>;

  constructor(options: BranchOptions<_Event>) {
    this._internal = {
      options,
      path: options.path,
    };
    this.steps = options.steps;
  }

  public route(path: string, options: RouteOptions<_Event> = {}) {
    if (!path.startsWith("/")) {
      throw new Error('Route paths must start with a "/".');
    }

    const joinedPath = this._internal.options.path.replace(/\/$/, "") + path;

    return this._internal.options.aquaInstance.route<_Event>(joinedPath, {
      steps: [...this.steps, ...(options?.steps ?? [])],
    });
  }

  public step<_StepFn extends StepFn<_Event>>(stepFn: _StepFn) {
    this.steps.push(stepFn);

    return this as Awaited<ReturnType<_StepFn>> extends never
      ? never
      : Awaited<ReturnType<_StepFn>> extends _Event
      ? Branch<Awaited<ReturnType<_StepFn>>>
      : this;
  }

  public respond<_RespondFn extends RespondFn<_Event>>(
    method: Method,
    respondFn: _RespondFn
  ) {
    this._internal.options.aquaInstance._internal.setRoute(
      method,
      this._internal.path,
      [
        ...this.steps,
        async (event: _Event) => {
          event.response = await respondFn(event);
          return event;
        },
      ]
    );

    return new ResponderBranch(this);
  }
}

/**
 * Used for every operation after the `.on(...)` call.
 */
export class ResponderBranch<_Event extends Event>
  implements Omit<Branch<_Event>, "route" | "step">
{
  get _internal() {
    return this.branch._internal;
  }

  constructor(private branch: Branch<_Event>) {}

  public respond<_RespondFn extends RespondFn<_Event>>(
    method: Method,
    respondFn: _RespondFn
  ) {
    return this.branch.respond(method, respondFn);
  }
}
