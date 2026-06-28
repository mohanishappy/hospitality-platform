import type { Context } from "hono";
import { problem } from "./problem";
import type { Env } from "./types";

const uuidLike =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!enterpriseId || !uuidLike.test(enterpriseId)) {
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

export { uuidLike };
