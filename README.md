# Aqua

Aqua is a minimal and fast web framework.

> :warning: This version is a WIP and has not yet been released. Please refer to the [main branch](https://github.com/grayliquid/aqua/tree/main) for the current documentation.

## Example usage

### It starts easy,

```typescript
import { Aqua } from "...";

const app = new Aqua({
  listen: {
    port: 80,
  },
});

app.route("/").respond(Method.GET, (_event) => {
  return new Response("Hello, World!");
});
```

### ... and stays easy.

```typescript
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

v1.route("/user").respond(Method.GET, (event) => {
  return Response.json({ data: { user: event.user } });
  //                                         ^ type User
});
```
