import {AquaResponse} from "./aqua";

export class AquaError {
    constructor(private _response: AquaResponse) {}

    public get response() {
        return this._response;
    }
}