import Aqua from "../aqua.ts";

const app = new Aqua(4000);

async function request(suffix: string = "") {
    const r = await fetch(`http://localhost:4000${suffix}`);

    return await r.text();
}

Deno.test("Is website up and is the content right?", async () => {
    app.route("/", "GET", (req) => "Hello, World!");
    const content = await request();

    if (content !== "Hello, World!") throw Error("Page isn't up or the content is wrong");
});

Deno.test("Middlewares working?", async () => {
    app.route("/", "GET", (req) => "Hello, REPLACE_ME!");
    app.register((req, respondValue) => {
        return respondValue.replace("REPLACE_ME", "Planet");
    });
    const content = await request();

    if (content !== "Hello, Planet!") throw Error("Middlewares don't seem to work");
});

Deno.test("URL parameters working?", async () => {
    app.route("/api/:action", "GET", (req) => {
        if (req.parameters.action !== "hello") throw Error("URL parameters don't seem to work");
    });

    const content = await request(`/api/hello`);
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 250);
    });
});