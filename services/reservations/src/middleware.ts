import type { MiddlewareHandler } from "hono";
import { problem } from "./problem";
import type { Env } from "./types";

export const requireChainForReservations: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next
) => {
  if (c.req.path === "/health") return next();
  if (c.req.path.startsWith("/v1/reservations") && !c.req.header("x-chain-id")) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  return next();
};
