// @TODO: delete this file
import { Aqua, Method } from "./aqua.ts";

const app = new Aqua({
  port: 3000,
});

app.route("/", Method.GET).respond((_event) => {
  return new Response("hello!");
});

app
  .route("/a", Method.GET)
  .step((event) => {
    return {
      ...event,
      isAuthorized: new URL(event.request.url).searchParams.has("test"),
    };
  })
  .respond((event) => {
    return new Response("isAuthorized: " + event.isAuthorized);
  });

app
  .route("/b", Method.GET)
  .step((event) => {
    event.response = new Response("early end()");
    event.end();
  })
  .respond((_event) => {
    return new Response("test");
  });

app
  .route("/c", Method.GET)
  .step((event) => {
    return {
      ...event,
      isNested: true,
    };
  })
  .route("/d", Method.GET)
  .respond((event) => {
    return new Response("isNested: " + event.isNested);
  });

const e = app.route("/e", Method.GET).step((event) => {
  return {
    ...event,
    isE: true,
  };
});
e.route("/f", Method.GET)
  .step((event) => {
    return {
      ...event,
      isF: true,
    };
  })
  .respond((event) => {
    return new Response("isF: " + event.isF + "; isE: " + event.isE);
  });
e.route("/g", Method.GET)
  .step((event) => {
    return {
      ...event,
      isF: false,
    };
  })
  .respond((event) => {
    return new Response("isF: " + event.isF + "; isE: " + event.isE);
  });
