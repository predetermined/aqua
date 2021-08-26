import Aqua from "../deploy.ts";

const app = new Aqua();

async function sendMockRequest(req: Request): Promise<Response> {
  return await new Promise((resolve) => {
    app._internal.mockRequest({
      request: req,
      respondWith: async (res) => {
        resolve(await res);
      },
    });
  });
}

Deno.test("Body parsing working?", async () => {
  app.post("/", (req) => req.body.hello?.toString() ?? "");

  const res = await sendMockRequest(
    new Request("http://local.host/", {
      method: "POST",
      body: new TextEncoder().encode(JSON.stringify({ hello: "world" })),
    }),
  );

  const text = await res.text();
  if (text !== "world") {
    throw new Error(`Returned ${text} instead of "world"`);
  }
});

Deno.test("File parsing working?", async () => {
  app.post("/", (req) => req.files.exampleFile?.size?.toString() ?? "");

  const exampleFile = Deno.readFileSync("tests/example.png");
  const data = new FormData();
  data.append("exampleFile", new Blob([exampleFile]));

  const res = await sendMockRequest(
    new Request("http://local.host/", {
      method: "POST",
      body: data,
    }),
  );

  const text = await res.text();
  if (text !== "1255") {
    throw new Error(`Returned ${text} instead of "1255"`);
  }
});
