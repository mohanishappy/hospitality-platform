import type { Context } from "hono";
import { problem } from "./problem";
import type { Env } from "./types";

export function parseRolesHeader(c: Context<{ Bindings: Env }>): string[] {
  const raw = c.req.header("x-roles")?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((r) => r.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

export function isPlatformOperatorRequest(c: Context<{ Bindings: Env }>): boolean {
  return parseRolesHeader(c).includes("platform_operator");
}

export function requirePlatformOperator(c: Context<{ Bindings: Env }>) {
  if (!isPlatformOperatorRequest(c)) {
    return problem(
      403,
      "Forbidden",
      "platform_operator role required for platform administration"
    );
  }
  return null;
}
