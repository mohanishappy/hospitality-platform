import type { Context } from "hono";
import type { Env } from "../types";
import { problem } from "../problem";
import { RESERVATION_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";
import {
  canTransitionTo,
  parseReservationStatus,
} from "../validation";

export async function patchReservationStatus(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const id = c.req.param("id");
  if (!id?.trim()) {
    return problem(400, "Bad Request", "Reservation id required");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }
  const parsed = parseReservationStatus(raw);
  if (!parsed.ok) {
    return problem(400, "Bad Request", parsed.detail);
  }
  const nextStatus = parsed.status;
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data: row, error: rowErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select("id, status")
    .eq("id", id.trim())
    .eq("chain_id", chainId)
    .maybeSingle();
  if (rowErr) {
    return problem(500, "Database error", rowErr.message);
  }
  if (!row) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  const transition = canTransitionTo(row.status, nextStatus);
  if (transition === "forbidden") {
    return problem(
      409,
      "Conflict",
      `Cannot change status from "${row.status}" to "${nextStatus}"`
    );
  }
  if (transition === "noop") {
    const { data: full, error: fetchErr } = await supa
      .schema("reservations")
      .from("reservation_stub")
      .select(RESERVATION_DETAIL_SELECT)
      .eq("id", id.trim())
      .eq("chain_id", chainId)
      .maybeSingle();
    if (fetchErr) {
      return problem(500, "Database error", fetchErr.message);
    }
    if (!full) {
      return problem(404, "Not Found", "Reservation not found for this chain");
    }
    return c.json({ reservation: full });
  }
  const now = new Date().toISOString();
  const { error: upErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .update({ status: nextStatus, updated_at: now })
    .eq("id", id.trim())
    .eq("chain_id", chainId);
  if (upErr) {
    return problem(500, "Database error", upErr.message);
  }
  const { data: full, error: fetchErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select(RESERVATION_DETAIL_SELECT)
    .eq("id", id.trim())
    .eq("chain_id", chainId)
    .maybeSingle();
  if (fetchErr) {
    return problem(500, "Database error", fetchErr.message);
  }
  if (!full) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  return c.json({ reservation: full });
}
