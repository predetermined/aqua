// @TODO: delete this file
import { Aqua, Method } from "./aqua.ts";

const app = new Aqua({
  port: 3000,
});

app.route("/", Method.GET).respond((_event) => {
  return new Response("hello!");
});
