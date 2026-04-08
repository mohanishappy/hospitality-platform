import { Hono } from "hono";
import { cors } from "hono/cors";
import { DOCS_HTML } from "./docs-html";
import openApiSpec from "./openapi.json";
import { problem } from "./problem";
import { requireAuthAndChain } from "./middleware";
import type { GatewayEnv, GatewayVariables } from "./types";
import { v1App } from "./v1-app";

const app = new Hono<{ Bindings: GatewayEnv; Variables: GatewayVariables }>();

app.use("*", cors());

app.get("/health", () =>
  new Response(JSON.stringify({ ok: true, service: "gateway" }), {
    headers: { "content-type": "application/json" },
  })
);

app.get("/openapi.json", (c) =>
  c.json(openApiSpec as Record<string, unknown>, 200, {
    "cache-control": "public, max-age=300",
  })
);

app.get("/docs", (c) =>
  c.html(DOCS_HTML, 200, { "cache-control": "public, max-age=300" })
);

app.use("*", requireAuthAndChain);
app.route("/v1", v1App());

app.notFound(() =>
  problem(404, "Not Found", "No route matched", "about:blank#not-found")
);

export default app;
export type { GatewayEnv, GatewayVariables } from "./types";
