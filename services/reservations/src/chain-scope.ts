import type { Context } from "hono";
import type { Env } from "./types";
import { problem } from "./problem";

const uuidLike =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Allowed chain UUIDs from gateway (`x-chain-ids` or legacy `x-chain-id`). */
export function parseAllowedChainIds(c: Context<{ Bindings: Env }>): string[] | null {
  const multiRaw = c.req.header("x-chain-ids")?.trim();
  if (multiRaw) {
    const ids = multiRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => uuidLike.test(s));
    if (ids.length > 0) return ids;
  }
  const single = c.req.header("x-chain-id")?.trim();
  if (single && uuidLike.test(single)) return [single];
  return null;
}

export function requireAllowedChainIds(c: Context<{ Bindings: Env }>) {
  const ids = parseAllowedChainIds(c);
  if (!ids?.length) {
    return {
      ok: false as const,
      response: problem(401, "Unauthorized", "Missing x-chain-id or x-chain-ids"),
    };
  }
  return { ok: true as const, ids };
}

export function reservationInScope(
  chainId: string | null | undefined,
  allowedIds: string[]
): boolean {
  if (!chainId) return false;
  return allowedIds.includes(chainId);
}
