import { exec, OutputMode } from "https://deno.land/x/exec/mod.ts";
import { serve } from "https://deno.land/std@0.75.0/http/server.ts";
import Aqua from "https://deno.land/x/aqua@v1.0.8/aqua.ts";
import { Drash } from "https://deno.land/x/drash@v1.2.5/mod.ts";
import { Server } from "https://deno.land/x/fen@v0.8.0/server.ts";
import { Application as ABCApplication } from "https://deno.land/x/abc@v1.2.0/mod.ts";

class Benchmark {
    private results: { name: string; result: { average: number; min: number; max: number; } }[] = [];

    public async test(name: string, port: number) {
        const { average, min, max }: { average: number; min: number; max: number; } = JSON.parse((await exec(`npx autocannon -c100 -j localhost:${port}`, { output: OutputMode.Capture })).output).requests;

        console.log(`Tested ${name} - AVG: ${average}`);
        this.results.push({
            name,
            result: {
                average,
                min,
                max
            }
        });
    }

    get result(): string {
        return this.results.map(({ name, result: { average, min, max } }) => {
            return `${name}: [AVG: ${average}; MIN: ${min}; MAX: ${max}]`;
        }).join("\n");
    }
}

const benchmark = new Benchmark();

const s = serve({ port: 3000 });
(async () => {
    for await (const req of s) {
        req.respond({ body: "Hello Deno!" });
    }
})();
await benchmark.test("HTTP Deno", 3000);

// Aqua
const aqua = new Aqua(3001);
aqua.get("/", (req: any) => {
    return "Hello Deno!";
});
await benchmark.test("aqua", 3001);

// Drash
class HomeResource extends Drash.Http.Resource {
    static paths = ["/"];
    public GET() {
        this.response.body = "Hello Deno!";
        return this.response;
    }
}
const drash = new Drash.Http.Server({
    response_output: "text/html",
    resources: [HomeResource]
});
drash.run({
    hostname: "localhost",
    port: 3002
});
await benchmark.test("drash", 3002);

// Fen
const fenServer = new Server();
fenServer.setController(async (context: any) => {
  context.body = "Hello Deno!";
});
fenServer.port = 3003;
fenServer.start();
await benchmark.test("fen", 3003);

// Abc
const abcServer = new ABCApplication();
abcServer
  .get("/hello", (c: any) => {
    return "Hello Deno!";
  })
  .start({ port: 3004 });
await benchmark.test("abc", 3004);

console.log(benchmark.result);
