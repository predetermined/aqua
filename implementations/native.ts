import Aqua from "../aqua.ts";
import { getAquaRequestFromNativeRequest } from "../shared.ts";

export default class NativeAqua extends Aqua {
  listen(port: number, { onlyTls }: { onlyTls: boolean }) {
    const listenerFns = [];

    if (this.options.tls) {
      listenerFns.push(
        Deno.listenTls.bind(undefined, {
          hostname: this.options.tls.hostname || "localhost",
          certFile: this.options.tls.certFile || "./localhost.crt",
          keyFile: this.options.tls.keyFile || "./localhost.key",
          port: this.options.tls.independentPort || port,
        }),
      );
    }

    if (!onlyTls) listenerFns.push(Deno.listen.bind(undefined, { port }));

    for (const listenerFn of listenerFns) {
      (async () => {
        for await (const conn of listenerFn()) {
          (async () => {
            for await (const event of Deno.serveHttp(conn)) {
              const req = await getAquaRequestFromNativeRequest(event, conn);
              this.handleRequest(req);
            }
          })();
        }
      })();
    }
  }
}
