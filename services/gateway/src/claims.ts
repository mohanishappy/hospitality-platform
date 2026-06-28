import type { JWTPayload } from "jose";

const NS = "https://hospitality.app/claims";

/** Match Auth0 role names case-insensitively (`Front Desk` → `front_desk`). */
export function normalizeRoleName(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
}

export function getChainId(payload: JWTPayload): string | null {
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${NS}/chain_id`];
  const flat = claims.chain_id;
  const v = (fromNs ?? flat) as string | number | undefined | null;
  if (v === undefined || v === null) return null;
  return String(v);
}

/** Enterprise UUID when token spans multiple brands. */
export function getEnterpriseId(payload: JWTPayload): string | null {
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${NS}/enterprise_id`];
  const flat = claims.enterprise_id;
  const v = (fromNs ?? flat) as string | number | undefined | null;
  if (v === undefined || v === null) return null;
  return String(v);
}

const STAFF_ROLES = new Set([
  "front_desk",
  "manager",
  "read_only",
  "integration",
]);

/** Staff roles resolved against inventory.staff_member / integration_client. */
export function isStaffUser(roles: string[] | null): boolean {
  if (roles === null) return false;
  if (roles.length === 0) return false;
  return roles.some((r) => STAFF_ROLES.has(normalizeRoleName(r)));
}

/** All chain UUIDs the user may access; null when claim absent (legacy single-chain token). */
export function getChainIds(payload: JWTPayload): string[] | null {
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${NS}/chain_ids`];
  const flat = claims.chain_ids;
  const raw = fromNs ?? flat;
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) {
    const ids = raw.map((v) => String(v).trim()).filter(Boolean);
    return ids.length > 0 ? ids : null;
  }
  if (typeof raw === "string" && raw.trim()) {
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : null;
  }
  return null;
}

/** Roles claim; `null` when absent (legacy tokens — full access at gateway). */
export function getRoles(payload: JWTPayload): string[] | null {
  const ns = "https://hospitality.app/claims";
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${ns}/roles`];
  const flat = claims.roles;
  const raw = fromNs ?? flat;
  if (raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.map((r) => normalizeRoleName(r)).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((r) => normalizeRoleName(r))
      .filter(Boolean);
  }
  return [];
}

export function isM2mToken(payload: JWTPayload): boolean {
  return payload.gty === "client-credentials";
}

/** Auth0 subject (`sub`) — stable staff identity for DB lookup. */
export function getSubject(payload: JWTPayload): string | null {
  const sub = payload.sub;
  if (typeof sub !== "string") return null;
  const trimmed = sub.trim();
  return trimmed || null;
}

/** OAuth client id on M2M tokens (`azp` or `client_id`). */
export function getOAuthClientId(payload: JWTPayload): string | null {
  const claims = payload as Record<string, unknown>;
  for (const key of ["azp", "client_id"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/** Login user email for guest-scoped reservation access. */
export function getUserEmail(payload: JWTPayload): string | null {
  const ns = "https://hospitality.app/claims";
  const claims = payload as Record<string, unknown>;
  const candidates = [claims.email, claims[`${ns}/email`]];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim().toLowerCase();
    if (trimmed) return trimmed;
  }
  return null;
}
