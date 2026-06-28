import { Hono } from "hono";
import { cors } from "hono/cors";
import { DOCS_HTML } from "./docs-html";
import openApiSpec from "./openapi.json";
import { problem } from "./problem";
import { requireAuthAndChain } from "./middleware";
import { withRequestMetrics } from "./observability";
import { runReadinessChecks } from "./readiness";
import { withRequestId } from "./request-id";
import type { GatewayEnv, GatewayVariables } from "./types";
import { v1App } from "./v1-app";

const app = new Hono<{ Bindings: GatewayEnv; Variables: GatewayVariables }>();

app.use("*", withRequestId);
app.use("*", withRequestMetrics);
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "gateway" }));

app.get("/health/ready", async (c) => {
  const { ok, checks } = await runReadinessChecks(c.env);
  const body = { ok, service: "gateway", checks };
  return c.json(body, ok ? 200 : 503);
});

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
