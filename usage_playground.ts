// @todo delete this file

import { ResponseError } from "./lib/response-error.ts";
import { Aqua, Method } from "./mod.ts";

const app = new Aqua({
  listen: {
    port: 80,
  },
});

app
  .route("/")
  .on(Method.GET)
  .respond((_event) => {
    return new Response("Hello, World!");
  });

// /v1
const getUserByRequest = (_req: Request) => Promise.resolve({ name: "test" });

const v1 = app.route("/v1").step(async (event) => {
  if (!event.request.headers.has("X-Api-Key")) {
    throw new ResponseError(
      "Missing API key",
      Response.json({ error: "MISSING_API_KEY" })
    );
  }

  const user = await getUserByRequest(event.request);
  //    ^ type User

  return {
    ...event,
    user,
  };
});

v1.route("/user")
  .on(Method.GET)
  .respond((event) => Response.json({ data: { user: event.user } }));
//                                                        ^ type User

// /test
const test = app.route("/test").step((event) => {
  console.log("/test global step");
  return event;
});

test
  .route("/1")
  // @todo should this run even when there is no response provided?
  .step((e) => (console.log("/test/1 before on"), e))
  .on(Method.GET)
  .step((e) => (console.log("/test/1 after on"), e))
  .respond(() => new Response("all good!"));
