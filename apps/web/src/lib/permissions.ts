/** Mirrors gateway `authorization.ts` for SPA gating (user tokens only). */
export type Permission =
  | "inventory:read"
  | "inventory:write"
  | "reservations:read"
  | "reservations:create"
  | "reservations:guest"
  | "reservations:confirm"
  | "reservations:cancel"
  | "reservations:notes";

const ALL_PERMISSIONS: Permission[] = [
  "inventory:read",
  "inventory:write",
  "reservations:read",
  "reservations:create",
  "reservations:guest",
  "reservations:confirm",
  "reservations:cancel",
  "reservations:notes",
];

const STAFF_ROLES = new Set(["manager", "front_desk", "integration"]);

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  read_only: [],
  guest: [
    "inventory:read",
    "reservations:read",
    "reservations:create",
    "reservations:cancel",
  ],
  front_desk: [
    "inventory:read",
    "inventory:write",
    "reservations:read",
    "reservations:create",
    "reservations:guest",
    "reservations:confirm",
    "reservations:cancel",
    "reservations:notes",
  ],
  manager: ALL_PERMISSIONS,
  integration: ["inventory:read", "reservations:read", "reservations:create"],
};

function permissionsForRoles(roles: string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (perms) {
      for (const p of perms) out.add(p);
    }
  }
  return out;
}

/** User SPA tokens without roles default to guest (matches gateway). */
export function effectivePermissions(
  roles: string[] | null
): Set<Permission> | null {
  if (roles === null) return permissionsForRoles(["guest"]);
  if (roles.length === 0) return permissionsForRoles(["guest"]);
  return permissionsForRoles(roles);
}

export function canAccess(
  granted: Set<Permission> | null | undefined,
  required: Permission
): boolean {
  if (granted === undefined) return true;
  if (granted === null) return true;
  return granted.has(required);
}

export function hasManagerRole(roles: string[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.includes("manager");
}

/** Staff calendar / chain-wide views — not for guest-only users. */
export function isGuestOnlyRole(roles: string[] | null | undefined): boolean {
  if (roles === null || roles === undefined) return true;
  if (roles.length === 0) return true;
  if (roles.some((r) => STAFF_ROLES.has(r))) return false;
  if (roles.includes("read_only")) return false;
  return true;
}
