import type { Context } from "hono";
import type { Env } from "../types";
import {
  guestScopeFromHeaders,
  redactStaffFields,
  requiresGuestEmailScope,
  reservationOwnedByGuestEmail,
} from "../guest-scope";
import { problem } from "../problem";
import { RESERVATION_LIST_SELECT } from "../selects";
import { supaClient } from "../supabase";
import { parseListQuery, parseReservationListFilters } from "../validation";

export async function listReservations(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const filters = parseReservationListFilters(c);
  if (!filters.ok) {
    return problem(400, "Bad Request", filters.detail);
  }
  const { limit, offset } = parseListQuery(c);
  const fetchCount = limit + 1;
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
  const select = guestScoped
    ? `${RESERVATION_LIST_SELECT}, guest!inner(email)`
    : RESERVATION_LIST_SELECT;
  let q = supa
    .schema("reservations")
    .from("reservation_stub")
    .select(select)
    .eq("chain_id", chainId);
  if (guestScoped && scope.userEmail) {
    q = q.eq("guest.email", scope.userEmail);
  }
  if (filters.status) {
    q = q.eq("status", filters.status);
  }
  if (filters.hotel_id) {
    q = q.eq("hotel_id", filters.hotel_id);
  }
  if (filters.stay_from && filters.stay_to) {
    q = q
      .lt("check_in", filters.stay_to)
      .gt("check_out", filters.stay_from);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + fetchCount - 1);
  if (error) {
    return problem(500, "Database error", error.message);
  }
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const reservations = guestScoped
    ? (page as unknown as Record<string, unknown>[]).map((row) =>
        redactStaffFields(row)
      )
    : page;
  return c.json({
    reservations,
    limit,
    offset,
    has_more: hasMore,
  });
}
