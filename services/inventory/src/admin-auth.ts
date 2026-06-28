import type { Context } from "hono";
import { isUuidLike, UUID_LIKE } from "../../../lib/uuid.ts";
import { problem } from "./problem";
import type { Env } from "./types";

export { UUID_LIKE as uuidLike };

export function parseRolesHeader(c: Context<{ Bindings: Env }>): string[] {
  const raw = c.req.header("x-roles")?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((r) => r.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export function isManagerRequest(c: Context<{ Bindings: Env }>): boolean {
  return parseRolesHeader(c).includes("manager");
}

export function requireManager(c: Context<{ Bindings: Env }>) {
  if (!isManagerRequest(c)) {
    return problem(
      403,
      "Forbidden",
      "Manager role required for staff administration"
    );
  }
  return null;
}

export function requireEnterpriseId(c: Context<{ Bindings: Env }>) {
  const enterpriseId = c.req.header("x-enterprise-id")?.trim() ?? "";
  if (!enterpriseId || !isUuidLike(enterpriseId)) {
    return {
      ok: false as const,
      response: problem(
        400,
        "Bad Request",
        "Missing or invalid x-enterprise-id (use gateway with enterprise token)"
      ),
    };
  }
  return { ok: true as const, enterpriseId };
}

