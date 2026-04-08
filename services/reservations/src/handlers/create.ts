import type { Context } from "hono";
import type { Env, RpcResult } from "../types";
import { problem } from "../problem";
import { RESERVATION_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";
import { parseCreateBody } from "../validation";

export async function createReservation(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const idem =
    c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key");
  if (!idem?.trim()) {
    return problem(
      400,
      "Bad Request",
      "Idempotency-Key header required (UUID recommended)"
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }
  const parsed = parseCreateBody(parsedJson);
  if (!parsed.ok) {
    return problem(400, "Bad Request", parsed.detail);
  }
  const b = parsed.body;
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa.rpc("create_reservation_idempotent", {
    p_chain_id: chainId,
    p_idempotency_key: idem.trim(),
    p_hotel_id: b.hotel_id,
    p_room_type_id: b.room_type_id,
    p_check_in: b.check_in,
    p_check_out: b.check_out,
    p_guest_first_name: b.guest.first_name,
    p_guest_last_name: b.guest.last_name,
    p_guest_email: b.guest.email,
    p_guest_phone: b.guest.phone ?? null,
  });
  if (error) {
    if (error.code === "23503") {
      return problem(
        400,
        "Bad Request",
        "Invalid foreign key (chain, hotel, or room_type)"
      );
    }
    if (error.code === "22023") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", error.message);
  }
  const row = data as RpcResult | null;
  if (
    !row ||
    typeof row.reservation_id !== "string" ||
    typeof row.created !== "boolean"
  ) {
    return problem(500, "Database error", "Unexpected RPC response");
  }
  const { data: full, error: fetchErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select(RESERVATION_DETAIL_SELECT)
    .eq("id", row.reservation_id)
    .eq("chain_id", chainId)
    .maybeSingle();
  if (fetchErr) {
    return problem(500, "Database error", fetchErr.message);
  }
  if (!full) {
    return problem(500, "Database error", "Reservation not found after create");
  }
  const status = row.created ? 201 : 200;
  return c.json(
    {
      reservation: full,
      idempotency_key: idem.trim(),
      idempotent_replay: !row.created,
    },
    status
  );
}
