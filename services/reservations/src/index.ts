import { Hono } from "hono";
import type { Env } from "./types";
import { requireChainForReservations } from "./middleware";
import { reservationsApp } from "./reservations-app";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireChainForReservations);
app.get("/health", (c) => c.json({ ok: true, service: "reservations" }));
app.route("/v1/reservations", reservationsApp());

export default app;
