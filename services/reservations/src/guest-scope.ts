import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRolesHeader } from "./validation";

const STAFF_ROLES = new Set(["manager", "front_desk", "integration"]);

/** Chain-wide staff access; guests and empty/default roles are email-scoped. */
export function requiresGuestEmailScope(roles: string[] | null): boolean {
  if (roles === null) return false;
  if (roles.some((r) => STAFF_ROLES.has(r))) return false;
  return true;
}

export function parseUserEmailHeader(header: string | undefined): string | null {
  const trimmed = header?.trim().toLowerCase();
  return trimmed || null;
}

export function guestScopeFromHeaders(headers: {
  roles?: string | undefined;
  userEmail?: string | undefined;
}): { roles: string[] | null; userEmail: string | null } {
  return {
    roles: parseRolesHeader(headers.roles),
    userEmail: parseUserEmailHeader(headers.userEmail),
  };
}

export async function reservationOwnedByGuestEmail(
  supa: SupabaseClient,
  chainId: string,
  reservationId: string,
  userEmail: string
): Promise<boolean> {
  const { data, error } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select("id, guest(email)")
    .eq("id", reservationId.trim())
    .eq("chain_id", chainId)
    .maybeSingle();
  if (error || !data) return false;
  const guest = (data as { guest?: { email?: string } | null }).guest;
  const email = guest?.email?.trim().toLowerCase();
  return email === userEmail.trim().toLowerCase();
}

/** Hide staff-only fields from guest-scoped responses. */
export function redactStaffFields<T extends Record<string, unknown>>(
  row: T
): Omit<T, "internal_note"> {
  const { internal_note: _internal, ...rest } = row;
  return rest;
}
