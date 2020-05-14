# Aqua
Aqua is a minimal and fast web framework.

## Features
- Immediate parsing of the request body, query and the cookie string
- Middleware functions
- Possibility for route changes while runtime

## Example usage
```typescript
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

## Response functions
```typescript
req.setCookie("hello", "world") // Sets a cookie with the name 'hello' and the value 'world'
req.setHeader("Access-Control-Allow-Origin", "*") // Corresponds to 'Access-Control-Allow-Origin: *'
req.setStatusCode(404) // Page returns with the status code 404
```