# Aqua

## Just get it running
```typescript
const app = new Aqua(3100, { ignoreTailingSlash: true });

app.route("/", "GET", (req) => {
    return "Hello, World!";
});
```

## Middlewares
You can register middlewares, that will be able to adjust the respond output the following way:
```typescript
app.register((req, respondValue) => {
    // do modifications to the respond value
    return respondValue;
});
```

## Request functions
```typescript
req.setCookie("hello", "world"); // Cookie 'hello' with value 'world'
req.setHeader("Access-Control-Allow-Origin", "") // Corresponds to 'Access-Control-Allow-Origin: *'
req.setStatusCode(404) // Page returns with the status code 404
```