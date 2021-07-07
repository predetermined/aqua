import Aqua, { mustExist, valueMustBeOfType } from "../aqua.ts";

const app = new Aqua(4000);
let registeredTests = 0;
let solvedTests = 0;

async function requestContent(suffix: string = "", options: any = {}) {
  return await (await fetch(`http://localhost:4000${suffix}`, options)).text();
}

async function requestHeaders(suffix: string = "", options: any = {}) {
  const res = await fetch(`http://localhost:4000${suffix}`, options);
  await res.text();
  return res.headers;
}

function registerTest(name: string, fn: () => any) {
  registeredTests++;
  Deno.test(name, async () => {
    await fn();
    solvedTests++;
  });
}

await requestContent();

registerTest("Is website up and is the content right?", async () => {
  app.get("/", (req) => "Hello, World!");

  const content = await requestContent();
  if (content !== "Hello, World!") {
    throw Error("Page isn't up or the content is wrong");
  }
});

registerTest("Middlewares working?", async () => {
  app.get("/", (req) => "Hello, REPLACE_ME!");
  app.register((req, res) => {
    if (req.url === "/") {
      res.content = (res.content as string)?.replace("REPLACE_ME", "Planet") ||
        "";
    }
    return res;
  });
  app.register((req, res) => {
    if (req.url === "/") {
      res.content =
        (res.content as string)?.replace("Planet", "Another Planet") || "";
    }
    return res;
  });

  const content = await requestContent();
  if (content !== "Hello, Another Planet!") {
    throw Error("Middlewares don't seem to work");
  }
});

registerTest("URL parameters working?", async () => {
  app.get("/api/:action", (req) => req.parameters.action);

  const content = await requestContent(`/api/hello`);
  if (content !== "hello") throw Error("URL parameters don't seem to work");
});

registerTest("URL query decoding working?", async () => {
  app.get("/search", (req) => JSON.stringify(req.query));

  const content = await requestContent(
    "/search?q=foo+bar&withCharsThatNeedEscaping=%24%26",
  );
  if (
    content !== `{"q":"foo bar","withCharsThatNeedEscaping":"$&"}`
  ) {
    throw Error("URL query decoding doesn't seem to work");
  }
});

registerTest("Custom fallback handler working?", async () => {
  app.provideFallback((req) => "Nothing to see here");

  const content = await requestContent(`/this_route_doesnt_exist`);
  if (content !== "Nothing to see here") {
    throw Error("Custom fallback handlers don't seem to work");
  }
});

registerTest("Regex routes working?", async () => {
  app.get(
    new RegExp("\/hello-world\/(.*)"),
    (req) => JSON.stringify(req.matches),
  );

  const content = await requestContent(`/hello-world/hello/okay`);
  if (JSON.parse(content)[0] !== "hello/okay") {
    throw Error("Regex routes don't seem to work");
  }
});

registerTest("Regex route priorities working?", async () => {
  app.get("/hello-world/should-trigger-first", (req) => "First!");

  const content = await requestContent(`/hello-world/should-trigger-first`);
  if (content !== "First!") {
    throw Error("Regex route priorities don't seem to work");
  }
});

registerTest(
  "Body parsing working if Object converted to JSON string?",
  async () => {
    app.post("/test-json-body-parsing", (req) => req.body.test);

    const content = await requestContent(`/test-json-body-parsing`, {
      method: "post",
      body: JSON.stringify({ test: "hello" }),
    });
    if (content !== "hello") {
      throw Error(
        "Body parsing of a object converted to a JSON string don't seem to work",
      );
    }
  },
);

registerTest("Body parsing working if passed form-urlencoded?", async () => {
  app.post("/test-form-urlencoded-body-parsing", (req) => req.body.test);

  const f = [
    encodeURIComponent("test") + "=" + encodeURIComponent("hello"),
  ].join("&");

  const content = await requestContent(`/test-form-urlencoded-body-parsing`, {
    method: "post",
    body: f,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
  });
  if (content !== "hello") {
    throw Error("Body parsing of form-urlencoded isn't working");
  }
});

registerTest("Body parsing working if passed FormData?", async () => {
  app.post("/test-formdata-body-parsing", (req) => req.body.test);

  const f = new FormData();
  f.append("test", "hello");

  const content = await requestContent(`/test-formdata-body-parsing`, {
    method: "post",
    body: f,
  });
  if (content !== "hello") {
    throw Error(`Body parsing of FormData isn't working (${content})`);
  }
});

registerTest("Query schemas working?", async () => {
  app.get("/test-query-schema-working", (req) => "Hello, World!", {
    schema: {
      query: [
        mustExist("hello"),
        valueMustBeOfType("hello", "string"),
      ],
    },
  });

  const content = await requestContent("/test-query-schema-working?hello=test");
  if (content !== "Hello, World!") {
    throw Error("Query schema validation functions didn't all pass");
  }
});

registerTest("Query schemas failing if wrong query provided?", async () => {
  app.get("/test-query-schema-failing", (req) => "Hello, World!", {
    schema: {
      query: [
        mustExist("hello"),
        valueMustBeOfType("hello", "number"),
      ],
    },
  });

  const content = await requestContent(
    "/test-query-schema-failing?nohello=test",
  );
  if (content === "Hello, World!") {
    throw Error(
      "Query schema validation functions pass although the correct query was not provided",
    );
  }
});

registerTest("Parameter schemas working?", async () => {
  app.get("/test-parameter-schema-working/:hello", (req) => "Hello, World!", {
    schema: {
      parameters: [
        mustExist("hello"),
        valueMustBeOfType("hello", "string"),
      ],
    },
  });

  const content = await requestContent("/test-parameter-schema-working/test");
  if (content !== "Hello, World!") {
    throw Error(
      "Parameter schema validation functions passed although they shouldn't",
    );
  }
});

registerTest(
  "Parameter schemas failing if validation functions should return false provided?",
  async () => {
    app.get("/test-parameter-schema-failing/:hello", (req) => "Hello, World!", {
      schema: {
        parameters: [
          mustExist("hello"),
          valueMustBeOfType("hello", "number"),
        ],
      },
    });

    const content = await requestContent("/test-parameter-schema-failing/test");
    if (content === "Hello, World!") {
      throw Error(
        "Parameter schema validation functions passed although they shouldn't",
      );
    }
  },
);

registerTest("Body schemas working?", async () => {
  app.post("/test-body-schema-working", (req) => "Hello, World!", {
    schema: {
      body: [
        mustExist("hello"),
        valueMustBeOfType("hello", "string"),
      ],
    },
  });

  const f = new FormData();
  f.append("hello", "hello");

  const content = await requestContent("/test-body-schema-working", {
    method: "post",
    body: f,
  });
  if (content !== "Hello, World!") {
    throw Error(
      "Body schema validation functions passed although they shouldn't",
    );
  }
});

registerTest(
  "Body schemas failing if validation functions should return false provided?",
  async () => {
    app.post("/test-body-schema-failing", (req) => "Hello, World!", {
      schema: {
        body: [
          mustExist("hello"),
          valueMustBeOfType("hello", "string"),
        ],
      },
    });

    const f = new FormData();
    f.append("nohello", "test");

    const content = await requestContent("/test-body-schema-failing", {
      method: "post",
      body: f,
    });
    if (content === "Hello, World!") {
      throw Error(
        "Body schema validation functions passed although they shouldn't",
      );
    }
  },
);

registerTest("File uploading working?", async () => {
  app.post("/upload", async (req) => {
    const { exampleFile } = req.files;
    return exampleFile.size.toString();
  });

  const exampleFile = Deno.readFileSync("tests/example.png");
  const f = new FormData();
  f.append("exampleFile", new Blob([exampleFile]));

  const content = await requestContent("/upload", { method: "post", body: f });
  if (content !== "1255") {
    throw Error(`File uploading route returned a wrong file size (${content})`);
  }
});

registerTest("File uploading with multiple files working?", async () => {
  app.post("/upload", async (req) => {
    const { exampleFile1, exampleFile2 } = req.files;
    return (exampleFile1.size + exampleFile2.size).toString();
  });

  const exampleFile1 = Deno.readFileSync("tests/example.png");
  const exampleFile2 = Deno.readFileSync("tests/example.jpg");
  const f = new FormData();
  f.append("exampleFile1", new Blob([exampleFile1]));
  f.append("exampleFile2", new Blob([exampleFile2]));

  const content = await requestContent("/upload", { method: "post", body: f });
  if (content !== "12231") {
    throw Error(
      "File uploading route returned a wrong file size when sending multiple files",
    );
  }
});

registerTest("mustExist function working?", async () => {
  const schemaContext = { test: 1 };
  if (!mustExist("test").bind(schemaContext)(schemaContext)) {
    throw Error("mustExist function returned wrong value");
  }
});

registerTest("mustExist function working if key not found?", async () => {
  const schemaContext = { test2: 1 };
  if (mustExist("test").bind(schemaContext)(schemaContext)) {
    throw Error("mustExist function returned wrong value");
  }
});

registerTest("valueMustBeByType function working?", async () => {
  const schemaContext = { test: 1 };
  if (
    !valueMustBeOfType("test", "number").bind(schemaContext)(schemaContext)
  ) {
    throw Error("valueMustBeByType function returned wrong value");
  }
});

registerTest(
  "valueMustBeByType function working if key not found?",
  async () => {
    const schemaContext = { test2: "test" };
    if (
      valueMustBeOfType("test", "string").bind(schemaContext)(schemaContext)
    ) {
      throw Error("valueMustBeByType function returned wrong value");
    }
  },
);

registerTest(
  "valueMustBeByType function working if key value has a different type?",
  async () => {
    const schemaContext = { test: false };
    if (
      valueMustBeOfType("test", "string").bind(schemaContext)(schemaContext)
    ) {
      throw Error("valueMustBeByType function returned wrong value");
    }
  },
);

registerTest("Replacement of raw file content working?", async () => {
  app.get("/example.txt", async (req) => {
    return await Deno.readFile("tests/example.txt");
  });

  app.register((req, res) => {
    if (req.url === "/example.txt") {
      if (res.content instanceof Uint8Array) {
        res.content = new TextDecoder().decode(res.content).replace(
          "Hello",
          "Hi",
        );
      }
    }
    return res;
  });

  const content = await requestContent("/example.txt");
  if (content !== "Hi") {
    throw new Error("Replacement of raw file content didn't work");
  }
});

registerTest("Cookies set?", async () => {
  app.get("/cookie-example", async (req) => {
    return {
      content: "hello",
      cookies: {
        test: "okay",
        test2: "okaytoo",
      },
    };
  });

  const headers = await requestHeaders("/cookie-example");
  if (headers.get("Set-Cookie") !== "test=okay, test2=okaytoo") {
    throw new Error("Cookies not set properly");
  }
});

registerTest("Headers set?", async () => {
  app.get("/headers-example", async (req) => {
    return {
      content: "hello",
      headers: {
        test: "okay",
        test2: "okaytoo",
      },
    };
  });

  const headers = await requestHeaders("/headers-example");
  if (
    headers.get("test") !== "okay" || headers.get("test2") !== "okaytoo"
  ) {
    throw new Error("Headers not set properly");
  }
});

registerTest("Headers received correct?", async () => {
  const testHeaders = {
    hello: "okay",
    world: "test",
  };

  app.get("/headers-receive-example", async (req) => {
    return JSON.stringify({
      hello: req.headers.hello,
      world: req.headers.world,
    });
  });

  const receivedHeaders = await requestContent("/headers-receive-example", {
    headers: testHeaders,
  });
  if (receivedHeaders !== JSON.stringify(testHeaders)) {
    throw new Error("Headers not received properly");
  }
});

setInterval(() => {
  if (registeredTests === solvedTests) Deno.exit(0);
}, 500);
