"use node";

import { httpRouter } from "convex/server";
import { callback } from "./tools/gmailOAuth";

const http = httpRouter();

http.route({
    path: "/oauth/gmail/callback",
    method: "GET",
    handler: callback,
});

export default http;
