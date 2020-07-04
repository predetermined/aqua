import { exec, OutputMode } from "https://deno.land/x/exec/mod.ts";
import { serve } from "https://deno.land/std@v0.60.0/http/server.ts";
import Aqua from "https://deno.land/x/aqua@v1.0.0/aqua.ts";
import { Fastro } from "https://deno.land/x/fastro@v0.12.4/mod.ts";
import { App } from "https://deno.land/x/attain@master/mod.ts";
import { Application, Router } from "https://deno.land/x/denotrain@v0.5.2/mod.ts";
import { Drash } from "https://deno.land/x/drash@v1.0.7/mod.ts";

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

// Fastro
const fastro = new Fastro();
fastro.get("/", (req: any) => {
    req.send("Hello Deno!");
});
fastro.listen({ port: 3002 });
await benchmark.test("fastro", 3002);

// Attain
const attain = new App();
attain.get("/", (req: any, res: any) => {
    res.send("Hello Deno!");
});
attain.listen({ port: 3003 });
await benchmark.test("attain", 3003);

// Denotrain
const denotrain = new Application({ port: 3004 });
const denotrainRouter = new Router();
denotrainRouter.get("/", (ctx: any) => {
    return "Hello Deno!";
});
denotrain.run();
await benchmark.test("denotrain", 3004);

// Drash
class HomeResource extends Drash.Http.Resource {
    static paths = ["/"];
    public GET() {
        this.response.body = "Hello World! deno + Drash is cool!";
        return this.response;
    }
}

const drash = new Drash.Http.Server({
    response_output: "text/html",
    resources: [HomeResource]
});

drash.run({
    hostname: "localhost",
    port: 3005
});
await benchmark.test("drash", 3005);

console.log(benchmark.result);