# Aqua

Aqua is a minimal and fast web framework.

> :warning: This version is a WIP and has not yet been released. Please refer to the [main branch](https://github.com/grayliquid/aqua/tree/main) for the current documentation.

## Example usage

```typescript
import { Aqua } from "...";

const app = new Aqua({
  listen: {
    port: 80,
  },
});

app.route("/", Method.GET).respond((_event) => {
  return new Response("Hello, World!");
});
```
