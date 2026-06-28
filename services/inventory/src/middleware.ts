import type { MiddlewareHandler } from "hono";
import { problem } from "./problem";
import type { Env } from "./types";

export const requireChainForInventory: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next
) => {
  if (c.req.path === "/health") return next();
  if (/^\/v1\/inventory\/chains(\/[^/]+)?$/.test(c.req.path)) return next();
  if (/^\/v1\/inventory\/staff\/access$/.test(c.req.path)) return next();
  if (/^\/v1\/inventory\/internal\/staff\/claims$/.test(c.req.path)) return next();
  if (/^\/v1\/inventory\/invites\/accept$/.test(c.req.path)) return next();
  if (/^\/v1\/inventory\/admin(\/.*)?$/.test(c.req.path)) {
    return next();
  }
  if (/^\/v1\/inventory\/me\/chains$/.test(c.req.path)) return next();
  if (/^\/v1\/inventory\/enterprises\/by-id\/[^/]+\/chains$/.test(c.req.path)) {
    return next();
  }
  if (/^\/v1\/inventory\/enterprises(\/[^/]+)?(\/chains)?$/.test(c.req.path)) {
    return next();
  }
  if (c.req.path.startsWith("/v1/inventory") && !c.req.header("x-chain-id")) {
    return problem(401, "Unauthorized", "Missing x-chain-id (use gateway)");
  }
  return next();
};
