import Aqua from "./aqua";
import {AquaError} from "./error";

const app = new Aqua({ port: 3000 });

app
    .route("/hello-world", "GET")
    .step((req) => {
        if (req.query.test !== "test") {
            throw new AquaError({
                statusCode: 500,
                content: "URL query parameter `test` has to be of value `test`"
            });
        }

        return req as typeof req & { query: typeof req["query"] & { test: "test" } };
    })
    .respond((req) => {
        req.query.test
        return "nice!";
    })