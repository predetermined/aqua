import {AquaRequest, AquaResponse, Route} from "./aqua";

type StepFn<Req = AquaRequest> = (req: Req) => unknown;
type RespondFn<Req = AquaRequest> = (req: Req) => AquaResponse;

export class Branch<Req = AquaRequest> {
    private readonly steps: StepFn[] = [];
    private respondFn: RespondFn;

    constructor(private readonly route: Route) {}

    public step<Fn extends StepFn = StepFn>(fn: Fn): Branch<ReturnType<Fn>> {
        this.steps.push(fn);
        return this<ReturnType<Fn>>;
    }

    public respond(fn: RespondFn<Req>): null {
        this.respondFn = fn;
        return null;
    }

    public _handleRequest(_req: AquaRequest): AquaResponse {
        let req = _req;
        for (const stepFn of this.step) {
            req = stepFn(req);
        }

        return this.respondFn(req) ?? "No response provided!";
    }
}