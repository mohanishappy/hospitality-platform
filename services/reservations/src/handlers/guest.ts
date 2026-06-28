import type { Context } from "hono";
import type { Env } from "../types";
import { ifMatchPreconditionResponse, normalizeRowVersion, weakEtag } from "../etag";
import { problem } from "../problem";
import { RESERVATION_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";
import { parseGuestPatchBody } from "../validation";

export async function patchGuest(c: Context<{ Bindings: Env }>) {
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
  const parsed = parseGuestPatchBody(raw);
  if (!parsed.ok) {
    return problem(400, "Bad Request", parsed.detail);
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data: resRow, error: resErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select("id, row_version")
    .eq("id", id.trim())
    .eq("chain_id", chainId)
    .maybeSingle();
  if (resErr) {
    return problem(500, "Database error", resErr.message);
  }
  if (!resRow) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  const rowVersion = normalizeRowVersion(resRow.row_version);
  if (rowVersion === null) {
    return problem(500, "Database error", "Missing row_version");
  }
  const pre = ifMatchPreconditionResponse(
    rowVersion,
    c.req.header("If-Match") ?? c.req.header("if-match")
  );
  if (pre) {
    return pre;
  }
  const { data: guestRow, error: gErr } = await supa
    .schema("reservations")
    .from("guest")
    .select("id")
    .eq("reservation_id", id.trim())
    .maybeSingle();
  if (gErr) {
    return problem(500, "Database error", gErr.message);
  }
  if (!guestRow) {
    return problem(
      404,
      "Not Found",
      "No guest record for this reservation (legacy bookings may lack guest)"
    );
  }
  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = {
    ...parsed.patch,
    updated_at: now,
  };
  const { error: upGuestErr } = await supa
    .schema("reservations")
    .from("guest")
    .update(updatePayload)
    .eq("id", guestRow.id);
  if (upGuestErr) {
    return problem(500, "Database error", upGuestErr.message);
  }
  const { error: upResErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .update({ updated_at: now })
    .eq("id", id.trim())
    .eq("chain_id", chainId);
  if (upResErr) {
    return problem(500, "Database error", upResErr.message);
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
  const rv = normalizeRowVersion(
    (full as { row_version?: unknown }).row_version
  );
  const out = c.json({ reservation: full });
  if (rv !== null) {
    out.headers.set("ETag", weakEtag(rv));
  }
  return out;
}
