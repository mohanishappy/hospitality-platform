import type { JWTPayload } from "jose";

/** Match Auth0 role names case-insensitively (`Front Desk` → `front_desk`). */
export function normalizeRoleName(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
}

export function getChainId(payload: JWTPayload): string | null {
  const ns = "https://hospitality.app/claims";
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${ns}/chain_id`];
  const flat = claims.chain_id;
  const v = (fromNs ?? flat) as string | number | undefined | null;
  if (v === undefined || v === null) return null;
  return String(v);
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
