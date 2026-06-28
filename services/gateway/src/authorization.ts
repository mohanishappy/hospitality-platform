import type { Context } from "hono";
import type { JWTPayload } from "jose";
import { getRoles, isM2mToken } from "./claims";
import { problem } from "./problem";
import type { GatewayEnv, GatewayVariables } from "./types";

/** Route permissions enforced when the token includes a roles claim (FR-Z1). */
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

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  read_only: ["inventory:read", "reservations:read"],
  front_desk: [
    "inventory:read",
    "inventory:write",
    "reservations:read",
    "reservations:create",
    "reservations:guest",
    "reservations:confirm",
    "reservations:notes",
  ],
  manager: ALL_PERMISSIONS,
  integration: [
    "inventory:read",
    "reservations:read",
    "reservations:create",
  ],
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

export function effectivePermissions(
  payload: JWTPayload,
  roles: string[] | null
): Set<Permission> | null {
  if (roles === null) {
    return null;
  }
  if (roles.length === 0) {
    return permissionsForRoles(["read_only"]);
  }
  const perms = permissionsForRoles(roles);
  if (isM2mToken(payload) && !roles.includes("manager")) {
    for (const p of ALL_PERMISSIONS) {
      if (p !== "inventory:read" && p !== "reservations:read" && p !== "reservations:create") {
        perms.delete(p);
      }
    }
  }
  return perms;
}

const uuidSegment = "[0-9a-fA-F-]{36}";

export function requiredPermissions(
  method: string,
  path: string,
  statusBody?: string
): Permission[] {
  const m = method.toUpperCase();
  if (path.startsWith("/v1/inventory")) {
    if (m === "GET") return ["inventory:read"];
    if (path.includes("/soft-holds") && (m === "POST" || m === "DELETE")) {
      return ["inventory:write"];
    }
  }
  if (path === "/v1/reservations") {
    if (m === "GET") return ["reservations:read"];
    if (m === "POST") return ["reservations:create"];
  }
  const detailRe = new RegExp(
    `^/v1/reservations/${uuidSegment}$`
  );
  const guestRe = new RegExp(
    `^/v1/reservations/${uuidSegment}/guest$`
  );
  const notesRe = new RegExp(
    `^/v1/reservations/${uuidSegment}/notes$`
  );
  if (detailRe.test(path)) {
    if (m === "GET") return ["reservations:read"];
    if (m === "PATCH") {
      if (statusBody === "cancelled") return ["reservations:cancel"];
      return ["reservations:confirm"];
    }
  }
  if (guestRe.test(path) && m === "PATCH") return ["reservations:guest"];
  if (notesRe.test(path) && m === "PATCH") return ["reservations:notes"];
  return ["inventory:read"];
}

export function hasPermission(
  granted: Set<Permission> | null,
  required: Permission[]
): boolean {
  if (granted === null) return true;
  return required.every((p) => granted.has(p));
}

async function readPatchStatus(c: Context): Promise<string | undefined> {
  if (c.req.method.toUpperCase() !== "PATCH") return undefined;
  const ct = c.req.header("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined;
  try {
    const raw = await c.req.raw.clone().json();
    if (raw && typeof raw === "object" && "status" in raw) {
      const s = (raw as { status?: unknown }).status;
      if (typeof s === "string") return s;
    }
  } catch {
    /* body parse optional for auth routing */
  }
  return undefined;
}

export async function enforceRouteAuthorization(
  c: Context<{ Bindings: GatewayEnv; Variables: GatewayVariables }>
): Promise<Response | undefined> {
  const payload = c.get("jwt");
  if (!payload) return undefined;

  const roles = getRoles(payload);
  c.set("roles", roles);
  const granted = effectivePermissions(payload, roles);
  if (granted === null) return undefined;

  const statusBody = await readPatchStatus(c);
  const needed = requiredPermissions(c.req.method, c.req.path, statusBody);
  if (!hasPermission(granted, needed)) {
    return problem(
      403,
      "Forbidden",
      `Insufficient role for ${c.req.method} ${c.req.path}`,
      "about:blank#forbidden"
    );
  }
  return undefined;
}
