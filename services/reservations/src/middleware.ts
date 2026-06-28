import type { MiddlewareHandler } from "hono";
import { problem } from "./problem";
import type { Env } from "./types";

export const requireChainForReservations: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next
) => {
  if (c.req.path === "/health") return next();
  if (c.req.path.startsWith("/v1/reservations")) {
    const hasSingle = Boolean(c.req.header("x-chain-id")?.trim());
    const hasMulti = Boolean(c.req.header("x-chain-ids")?.trim());
    if (!hasSingle && !hasMulti) {
      return problem(401, "Unauthorized", "Missing x-chain-id or x-chain-ids");
    }
  }
  return next();
};
