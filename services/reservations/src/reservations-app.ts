import { Hono } from "hono";
import type { Env } from "./types";
import { createReservation } from "./handlers/create";
import { getReservation } from "./handlers/detail";
import { patchGuest } from "./handlers/guest";
import { listReservations } from "./handlers/list";
import { patchReservationStatus } from "./handlers/status";

export function reservationsApp() {
  const r = new Hono<{ Bindings: Env }>();
  r.get("/", listReservations);
  r.post("/", createReservation);
  r.get("/:id", getReservation);
  r.patch("/:id/guest", patchGuest);
  r.patch("/:id", patchReservationStatus);
  return r;
}
