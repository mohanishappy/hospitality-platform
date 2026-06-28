import type { Context } from "hono";
import type { Env } from "../types";
import { requireAllowedChainIds, reservationInScope } from "../chain-scope";
import { normalizeRowVersion, weakEtag } from "../etag";
import {
  guestScopeFromHeaders,
  redactStaffFields,
  requiresGuestEmailScope,
  reservationOwnedByGuestEmail,
} from "../guest-scope";
import { problem } from "../problem";
import { RESERVATION_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";

export async function getReservation(c: Context<{ Bindings: Env }>) {
  const scopeResult = requireAllowedChainIds(c);
  if (!scopeResult.ok) return scopeResult.response;
  const allowedChainIds = scopeResult.ids;

  const id = c.req.param("id");
  if (!id?.trim()) {
    return problem(400, "Bad Request", "Reservation id required");
  }
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
  const { data, error } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select(RESERVATION_DETAIL_SELECT)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) {
    return problem(500, "Database error", error.message);
  }
  if (!data || !reservationInScope(data.chain_id, allowedChainIds)) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  if (
    guestScoped &&
    scope.userEmail &&
    !(await reservationOwnedByGuestEmail(
      supa,
      allowedChainIds,
      id.trim(),
      scope.userEmail
    ))
  ) {
    return problem(404, "Not Found", "Reservation not found for this chain");
  }
  const reservation = guestScoped
    ? redactStaffFields(data as Record<string, unknown>)
    : data;
  const rv = normalizeRowVersion(
    (reservation as { row_version?: unknown }).row_version
  );
  const res = c.json({ reservation });
  if (rv !== null) {
    res.headers.set("ETag", weakEtag(rv));
  }
  return res;
}
