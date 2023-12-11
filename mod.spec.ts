import { assert } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { FakeAqua, Method } from "./mod.ts";
import { getPatternPathnameGroups } from "./x/get-pathname-groups.ts";

Deno.test(async function notFound() {
  const app = new FakeAqua();

  const res = await app.fakeCall(new Request("http://localhost/"));

  assert(res.status === 404);
  assert((await res.text()) === "Not found.");
});

Deno.test(async function simpleDELETE() {
  const app = new FakeAqua();

  app.route("/").respond(Method.DELETE, (_event) => new Response("worked!"));

  const res = await app.fakeCall(
    new Request("http://localhost/", {
      method: "DELETE",
    })
  );

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function simpleGET() {
  const app = new FakeAqua();

  app.route("/").respond(Method.GET, (_event) => new Response("worked!"));

  const res = await app.fakeCall(new Request("http://localhost/"));

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function getWithUrlPattern() {
  const app = new FakeAqua();

  app
    .route("/hello/:text")
    .respond(
      Method.GET,
      (event) => new Response(getPatternPathnameGroups(event).get("text"))
    );

  const res = await app.fakeCall(new Request("http://localhost/hello/world"));

  assert(res.status === 200);
  assert((await res.text()) === "world");
});

Deno.test(async function simpleOPTIONS() {
  const app = new FakeAqua();

  app.route("/").respond(Method.OPTIONS, (_event) => new Response("worked!"));

  const res = await app.fakeCall(
    new Request("http://localhost/", {
      method: "OPTIONS",
    })
  );

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function simpleHEAD() {
  const app = new FakeAqua();

  app.route("/").respond(Method.HEAD, (_event) => new Response("worked!"));

  const res = await app.fakeCall(
    new Request("http://localhost/", {
      method: "HEAD",
    })
  );

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function simpleOPTIONS() {
  const app = new FakeAqua();

  app.route("/").respond(Method.PATCH, (_event) => new Response("worked!"));

  const res = await app.fakeCall(
    new Request("http://localhost/", {
      method: "PATCH",
    })
  );

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function simplePOST() {
  const app = new FakeAqua();

  app.route("/").respond(Method.POST, (_event) => new Response("worked!"));

  const res = await app.fakeCall(
    new Request("http://localhost/", { method: "POST" })
  );

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function simplePUT() {
  const app = new FakeAqua();

  app.route("/").respond(Method.PUT, (_event) => new Response("worked!"));

  const res = await app.fakeCall(
    new Request("http://localhost/", { method: "PUT" })
  );

  assert(res.status === 200);
  assert((await res.text()) === "worked!");
});

Deno.test(async function addCustomPropertyStep() {
  const app = new FakeAqua();

  app
    .route("/")
    .step((event) => {
      return {
        ...event,
        foo: "bar",
      };
    })
    .respond(Method.GET, (event) => new Response(event.foo));

  const res = await app.fakeCall(new Request("http://localhost/"));

  assert(res.status === 200);
  assert((await res.text()) === "bar");
});

Deno.test(async function failEventInStep() {
  const app = new FakeAqua();

  app
    .route("/")
    .step((event) => {
      // just so it doesn't infer `never`
      if (event.request.headers.has("test")) return event;

      event.response = new Response("failed", { status: 500 });
      return event.end();
    })
    .respond(Method.GET, (_event) => new Response("succeeded"));

  const res = await app.fakeCall(new Request("http://localhost/"));

  assert(res.status === 500);
  assert((await res.text()) === "failed");
});
