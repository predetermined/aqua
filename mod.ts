import { Options } from "./aqua.ts";
import NativeAqua from "./implementations/native.ts";
import StdHttpAqua from "./implementations/std_http.ts";

export * from "./aqua.ts";

export const HAS_NATIVE_HTTP_SUPPORT = parseFloat(Deno.version.deno) >= 1.13;

function Aqua(port: number, options?: Options) {
  if (HAS_NATIVE_HTTP_SUPPORT) {
    return new NativeAqua(port, options);
  }

  return new StdHttpAqua(port, options);
}

export default Aqua as unknown as {
  new (port: number, options?: Options): StdHttpAqua | NativeAqua;
};
