# Aqua

Aqua is a minimal and fast web framework.

## Features

- Immediate parsing of the request body, query and the cookie string
- Middleware functions
- Possibility for route changes while runtime
- URL parameters
- [Deno Deploy support](#using-deno-deploy)

## Example usage

```typescript
import Aqua from "https://deno.land/x/aqua/mod.ts";

const app = new Aqua(3100);

app.get("/", (req) => {
  return "Hello, World!";
});
```

## Routing

You can either use the short-form syntax for the `GET`, `POST`, `PUT`, `PATCH` and `DELETE` method

```typescript
app.get("/", (req) => "Hello, World!");
app.post("/", (req) => "Hello, World!");
app.put("/", (req) => "Hello, World!");
app.patch("/", (req) => "Hello, World!");
app.delete("/", (req) => "Hello, World!");
```

or use the route function

```typescript
app.route("/", "GET", (req) => "Hello, World!");
```

## Schemas

Schemas will discard non-matching requests (Defined fallback handler or default
404).

```typescript
app.get("/", (req) => {
  return "Hello, World!";
}, {
  schema: {
    query: [
      mustExist("hello"),
    ],
  },
});
```

This schema would only allow requests with the `hello` query (for example,
`GET /?hello=yes`). The following helper functions are currently available:

- `mustExist(key)`
- `valueMustBeOfType(key, type)`
- `mustContainValue(key, values)`

You can of course also build your own schema validation functions. Here's how
the `mustExist` function looks:

```typescript
function mustExist(key: string): RoutingSchemaValidationFunction {
  return (context) => {
    /**
     * `context` could either be a `cookies`,
     * `parameters`, `headers`, `query` or `body` object.
     */
    return Object.keys(context).includes(key);
  };
}
```

## Middlewares

You can register middlewares, that will be able to adjust the response object,
the following way. Thereby you can decide whether you would like to modify the outgoing
or incoming request.

```typescript
app.register((req, res) => {
    /**
     * Skip Uint8Array responses:
     * if (typeof res.content !== "string") return res;
     *
     * res.content = res.content.replace("Hello", "Hi");
     */
    return res;
}, MiddlewareType.Outgoing);
```

```typescript
app.register((req) => {
    /**
     * req.query.hello = "world";
     */
    return req;
}, MiddlewareType.Incoming);
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
    content: "Hello, World!",
  };
});
```

Cookies and headers are just getting appended, so no information is getting lost
by providing custom ones. However, you can still overwrite existing headers.

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

### Static routes

You can register static routes by passing the path to the local folder and the
public alias to the `serve` function.

```typescript
app.serve("mystaticfolder", "/public");
// A GET request to /public/test.txt would serve the local file at mystaticfolder/test.txt
```

### Regex paths

You can provide a RegExp object instead of a string and receive the matches.

```typescript
app.get(new RegExp("\/(.*)"), (req) => {
  console.log(req.matches); // GET /hello-world -> [ "hello-world" ]

  return "Hello, World!";
});
```

### TLS

You can enable TLS the following way:

```typescript
const app = new Aqua(3001, {
  tls: {
    hostname: "localhost",
    certFile: "localhost.crt",
    keyFile: "localhost.key",
  },
});
```

The example above would handle requests coming to `https://localhost:3001`.

#### Handle HTTP and HTTPS requests

You are able to provide the TLS certificate to a different port and let the
default port still handle HTTP requests.

```typescript
const app = new Aqua(3001, {
  tls: {
    hostname: "localhost",
    certFile: "localhost.crt",
    keyFile: "localhost.key",
    independentPort: 3002,
  },
});
```

The example above would allow you to handle requests to `http://localhost:3001`
and `https://localhost:3002` at the same time.

### File uploading

```typescript
app.post("/upload", async (req) => {
  const { newProfilePicture } = req.files;
  await Deno.writeFile(
    newProfilePicture.name,
    new Uint8Array(await newProfilePicture.arrayBuffer()),
  );

  return "Uploaded!";
});
```

### Using [Deno Deploy](https://deno.com/deploy)
```typescript
import Aqua from "https://deno.land/x/aqua/deploy.ts";
//                                         ^^^^^^^^^

const app = new Aqua();
//                  ^^ (No port)

app.get("/", (req) => {
  return "Hello, World!";
});
```
Yes, that's it. Everything else should work as you are used to. :)