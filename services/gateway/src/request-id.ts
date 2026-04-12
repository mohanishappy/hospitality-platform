import type { MiddlewareHandler } from "hono";
import type { GatewayEnv, GatewayVariables } from "./types";

/** Generate or forward `x-request-id`; set on the response for correlation (FR-O1). */
export const withRequestId: MiddlewareHandler<{
  Bindings: GatewayEnv;
  Variables: GatewayVariables;
}> = async (c, next) => {
  const incoming = c.req.header("x-request-id")?.trim();
  const rid = incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
  c.set("requestId", rid);
  await next();
  c.header("x-request-id", rid);
};
