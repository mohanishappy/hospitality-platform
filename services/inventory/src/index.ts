import { Hono } from "hono";
import type { Env } from "./types";
import { inventoryApp } from "./inventory-app";
import { requireChainForInventory } from "./middleware";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireChainForInventory);
app.get("/health", (c) => c.json({ ok: true, service: "inventory" }));
app.route("/v1/inventory", inventoryApp());

export default app;
