import { Hono } from "hono";
import { cors } from "hono/cors";
import { DOCS_HTML } from "./docs-html";
import openApiSpec from "./openapi.json";
import { problem } from "./problem";
import { requireAuthAndChain } from "./middleware";
import { withRequestId } from "./request-id";
import type { GatewayEnv, GatewayVariables } from "./types";
import { v1App } from "./v1-app";

const app = new Hono<{ Bindings: GatewayEnv; Variables: GatewayVariables }>();

app.use("*", withRequestId);
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "gateway" }));

app.get("/health/ready", async (c) => {
  const domain = c.env.AUTH0_DOMAIN;
  const audience = c.env.AUTH0_AUDIENCE;
  if (!domain || !audience) {
    return c.json(
      { ok: false, service: "gateway", checks: { auth0_config: false } },
      503
    );
  }
  try {
    const res = await fetch(`https://${domain}/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return c.json(
        { ok: false, service: "gateway", checks: { jwks: false } },
        503
      );
    }
    return c.json({
      ok: true,
      service: "gateway",
      checks: { jwks: true },
    });
  } catch {
    return c.json(
      { ok: false, service: "gateway", checks: { jwks: false } },
      503
    );
  }
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
