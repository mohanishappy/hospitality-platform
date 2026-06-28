import type { Context } from "hono";
import type { Env } from "../types";
import { ifMatchPreconditionResponse, normalizeRowVersion, weakEtag } from "../etag";
import { problem } from "../problem";
import { RESERVATION_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";
import {
  canWriteInternalNote,
  parseNotesPatchBody,
  parseRolesHeader,
} from "../validation";

export async function patchNotes(c: Context<{ Bindings: Env }>) {
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
  const parsed = parseNotesPatchBody(raw);
  if (!parsed.ok) {
    return problem(400, "Bad Request", parsed.detail);
  }
  const roles = parseRolesHeader(c.req.header("x-roles"));
  if (
    "internal_note" in parsed.patch &&
    !canWriteInternalNote(roles)
  ) {
    return problem(
      403,
      "Forbidden",
      "internal_note requires the manager role"
    );
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
  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = {
    updated_at: now,
    ...parsed.patch,
  };
  const { error: upErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .update(updatePayload)
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
  const rv = normalizeRowVersion(
    (full as { row_version?: unknown }).row_version
  );
  const out = c.json({ reservation: full });
  if (rv !== null) {
    out.headers.set("ETag", weakEtag(rv));
  }
  return out;
}
