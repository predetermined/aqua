import Aqua from "../aqua.ts";
import {
  getAquaRequestFromHttpServerRequest,
  serve,
  Server,
  serveTLS,
} from "../shared.ts";

export default class StdHttpAqua extends Aqua {
  listen(port: number, { onlyTls }: { onlyTls: boolean }) {
    const servers: Server[] = [];

    if (super.options?.tls) {
      servers.push(
        serveTLS({
          hostname: super.options.tls.hostname || "localhost",
          certFile: super.options.tls.certFile || "./localhost.crt",
          keyFile: super.options.tls.keyFile || "./localhost.key",
          port: super.options.tls.independentPort || port,
        }),
      );
    }

    if (!onlyTls) servers.push(serve({ port }));

    for (const server of servers) {
      (async () => {
        for await (const serverRequest of server) {
          const req = await getAquaRequestFromHttpServerRequest(serverRequest);
          super.handleRequest(req);
        }
      })();
    }
  }
}
