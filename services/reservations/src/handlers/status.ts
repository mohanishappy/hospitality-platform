import type { Context } from "hono";
import type { Env } from "../types";
import { ifMatchPreconditionResponse, normalizeRowVersion, weakEtag } from "../etag";
import {
  guestScopeFromHeaders,
  requiresGuestEmailScope,
  reservationOwnedByGuestEmail,
} from "../guest-scope";
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
  const scope = guestScopeFromHeaders({
    roles: c.req.header("x-roles"),
    userEmail: c.req.header("x-user-email"),
  });
  const guestScoped = requiresGuestEmailScope(scope.roles);
  if (guestScoped && !scope.userEmail) {
    return problem(
      403,
      "Forbidden",
      "Guest access requires an email claim on the access token"
    );
  }
  const supa = supaClient(c.env);
  const { data: row, error: rowErr } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select("id, status, row_version")
    .eq("id", id.trim())
    .eq("chain_id", chainId)
    .maybeSingle();
  if (rowErr) {
    return problem(500, "Database error", rowErr.message);
  }
  if (!row) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  if (
    guestScoped &&
    scope.userEmail &&
    !(await reservationOwnedByGuestEmail(
      supa,
      chainId,
      id.trim(),
      scope.userEmail
    ))
  ) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  if (guestScoped && nextStatus !== "cancelled") {
    return problem(
      403,
      "Forbidden",
      "Guests may only cancel their own reservations"
    );
  }
  const rowVersion = normalizeRowVersion(row.row_version);
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
    const rv = normalizeRowVersion(
      (full as { row_version?: unknown }).row_version
    );
    const res = c.json({ reservation: full });
    if (rv !== null) {
      res.headers.set("ETag", weakEtag(rv));
    }
    return res;
  }
  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = {
    status: nextStatus,
    updated_at: now,
  };
  if (nextStatus === "cancelled") {
    updatePayload.cancelled_at = now;
    if (parsed.cancellation_reason !== undefined) {
      updatePayload.cancellation_reason = parsed.cancellation_reason;
    }
  }
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
  const rv2 = normalizeRowVersion(
    (full as { row_version?: unknown }).row_version
  );
  const out = c.json({ reservation: full });
  if (rv2 !== null) {
    out.headers.set("ETag", weakEtag(rv2));
  }
  return out;
}
