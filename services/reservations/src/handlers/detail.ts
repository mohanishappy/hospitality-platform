import type { Context } from "hono";
import type { Env } from "../types";
import { problem } from "../problem";
import { RESERVATION_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";

export async function getReservation(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const id = c.req.param("id");
  if (!id?.trim()) {
    return problem(400, "Bad Request", "Reservation id required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select(RESERVATION_DETAIL_SELECT)
    .eq("id", id.trim())
    .eq("chain_id", chainId)
    .maybeSingle();
  if (error) {
    return problem(500, "Database error", error.message);
  }
  if (!data) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  return c.json({ reservation: data });
}
