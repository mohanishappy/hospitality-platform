const ROLES_CLAIM = "https://hospitality.app/claims/roles";

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part?.trim()) return {};
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** `null` = claim absent (legacy full access). */
export function parseRolesFromPayload(payload: Record<string, unknown>): string[] | null {
  const raw = payload[ROLES_CLAIM] ?? payload.roles;
  if (raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.map(normalizeRole).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map(normalizeRole).filter(Boolean);
  }
  return [];
}

function normalizeRole(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
}

export function formatRolesLabel(roles: string[] | null | undefined): string {
  if (roles === undefined) return "…";
  if (roles === null || roles.length === 0) return "guest (default)";
  return roles.join(", ");
}
