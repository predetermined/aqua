# Aqua

## A simple example
```typescript
const app = new Aqua(3100, { ignoreTailingSlash: true });

app.route("/", "GET", (req) => {
    req.respond({ body: "Hello world!" });
});
```