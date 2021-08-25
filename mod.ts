import { Options } from "./aqua.ts";
import NativeAqua from "./implementations/native.ts";
import StdHttpAqua from "./implementations/std_http.ts";

export * from "./aqua.ts";

const ENABLE_NATIVE_SERVING = parseFloat(Deno.version.deno) >= 1.14;

function Aqua(port: number, options?: Options) {
  if (ENABLE_NATIVE_SERVING) {
    return new NativeAqua(port, options);
  }

  return new StdHttpAqua(port, options);
}

export default Aqua as unknown as {
  new (port: number, options?: Options): StdHttpAqua | NativeAqua;
};
