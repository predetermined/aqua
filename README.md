# Aqua
Aqua is a minimal and fast web framework.

## Features
- Immediate parsing of the request body, query and the cookie string
- Middleware functions
- Possibility for route changes while runtime

## Example usage
```typescript
import Aqua from "https://deno.land/x/aqua/aqua.ts";

const app = new Aqua(3100);

app.get("/", (req) => {
    return "Hello, World!";
});
```

## Routing
You can either use the short-form syntax for the `GET` and `POST` method
```typescript
app.get("/", (req) => "Hello, World!")
app.post("/", (req) => "Hello, World!")
```

or use the route function
```typescript
app.route("/", "GET", (req) => "Hello, World!")
```

## Middlewares
You can register middlewares, that will be able to adjust the respond value, the following way:
```typescript
app.register((req, respondValue) => {
    // do modifications to the respond value
    return respondValue;
});
```

## URL parameters
You can define URL parameters by using a colon followed by the key name.
```typescript
app.get("/api/:action", (req) => {
    return req.parameters.action;
});
```

## Response value
You can either just return a string
```typescript
app.get("/", (req) => {
    return "Hello, World!";
});
```

or return a response object to also set cookies, headers or a status code
```typescript
app.get("/", (req) => {
    return {
        statusCode: 200,
        cookies: { hello: "I'm a cookie value" },
        headers: { hello: "I'm a header value" },
        content: "Hello, World!"
    };
});
```
Cookies and headers are just getting appended, so no information is getting lost by providing custom ones.
However, you can still overwrite existing headers.