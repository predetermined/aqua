# Aqua
Aqua is a minimal and fast web framework.

## Features
- Immediate parsing of the request body, query and the cookie string
- Middleware functions
- Possibility for route changes while runtime
- URL parameters

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
app.get("/", (req) => "Hello, World!");
app.post("/", (req) => "Hello, World!");
```

or use the route function
```typescript
app.route("/", "GET", (req) => "Hello, World!");
```

## Middlewares
You can register middlewares, that will be able to adjust the respond object, the following way:
```typescript
app.register((req, response) => {
    // Make changes to the response object
    // response.content = response.content.replace("Hello", "Hi");
    return response;
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

## More examples

### Respond with the content of a file
```typescript
app.get("/", async (req) => {
    return await app.render("index.html");
});
```
_Please note that you must run your application with the `--allow-read` flag._

### Provide own fallback handler
Your provided fallback handler will be executed if no route has been found.
```typescript
app.provideFallback((req) => {
    return "No page found, sorry!";
});
```

### Redirect a request
```typescript
app.get("/dashboard", (req) => {
    return { redirect: "/login" };
});
```