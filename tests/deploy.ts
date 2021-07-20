import Aqua, { FetchEvent } from "../deploy.ts";

const aqua = new Aqua();

Deno.test("Body parsing working?", async () => {
  const sampleReq = new Request("http://local.host", {
    method: "POST",
    body: new TextEncoder().encode(JSON.stringify({ hello: "world" })),
  });
  const parsedRequest = await aqua._experimental.parseRequest(
    { request: sampleReq } as FetchEvent,
  );

  if (parsedRequest.body.hello !== "world") {
    throw new Error(
      `Returned ${parsedRequest.body} instead of { hello: "world" }`,
    );
  }
});

Deno.test("File parsing working?", async () => {
  const exampleFile = Deno.readFileSync("tests/example.png");
  const f = new FormData();
  f.append("exampleFile", new Blob([exampleFile]));
  const sampleReq = new Request("http://local.host", {
    method: "POST",
    body: f,
  });
  const parsedRequest = await aqua._experimental.parseRequest(
    { request: sampleReq } as FetchEvent,
  );

  if (parsedRequest.files.exampleFile.size !== 1255) {
    throw new Error(
      `Returned ${parsedRequest.files} instead of exampleFile with a size of 1255`,
    );
  }
});
