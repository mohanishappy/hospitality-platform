import { Hono } from "hono";
import { forward } from "./forward";
import type { GatewayEnv, GatewayVariables } from "./types";

export function v1App() {
  const r = new Hono<{ Bindings: GatewayEnv; Variables: GatewayVariables }>();
  r.all("/inventory/*", (c) => forward(c, c.env.INVENTORY));
  r.all("/inventory", (c) => forward(c, c.env.INVENTORY));
  r.all("/reservations/*", (c) => forward(c, c.env.RESERVATIONS));
  r.all("/reservations", (c) => forward(c, c.env.RESERVATIONS));
  return r;
}
