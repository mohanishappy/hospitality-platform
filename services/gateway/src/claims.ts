import type { JWTPayload } from "jose";

export function getChainId(payload: JWTPayload): string | null {
  const ns = "https://hospitality.app/claims";
  const claims = payload as Record<string, unknown>;
  const fromNs = claims[`${ns}/chain_id`];
  const flat = claims.chain_id;
  const v = (fromNs ?? flat) as string | number | undefined | null;
  if (v === undefined || v === null) return null;
  return String(v);
}
