import type { GatewayEnv } from "./types";

export type StaffAccessRecord = {
  provisioned: boolean;
  active?: boolean;
  all_chains?: boolean;
  chain_ids?: string[];
};

const CACHE_TTL_MS = 60_000;

type CacheEntry = { value: StaffAccessRecord; expiresAt: number };

const staffAccessCache = new Map<string, CacheEntry>();

function cacheGet(key: string): StaffAccessRecord | undefined {
  const hit = staffAccessCache.get(key);
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    staffAccessCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: StaffAccessRecord) {
  staffAccessCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function fetchStaffAccess(
  env: GatewayEnv,
  enterpriseId: string,
  identity: { auth0Sub?: string | null; clientId?: string | null }
): Promise<StaffAccessRecord> {
  const sub = identity.auth0Sub?.trim();
  const clientId = identity.clientId?.trim();
  const cacheKey = clientId
    ? `${enterpriseId}:client:${clientId}`
    : `${enterpriseId}:sub:${sub ?? ""}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const qs = new URLSearchParams({ enterprise_id: enterpriseId });
  if (clientId) qs.set("client_id", clientId);
  else if (sub) qs.set("auth0_sub", sub);
  else return { provisioned: false };

  const url = new URL(
    `/v1/inventory/staff/access?${qs.toString()}`,
    "https://internal"
  );
  const res = await env.INVENTORY.fetch(
    new Request(url.toString(), { method: "GET" })
  );
  if (!res.ok) {
    return { provisioned: false };
  }
  const body = (await res.json()) as { access?: StaffAccessRecord };
  const access = body.access ?? { provisioned: false };
  cacheSet(cacheKey, access);
  return access;
}

/** Test helper — clears in-memory cache between cases. */
export function clearStaffAccessCache() {
  staffAccessCache.clear();
}
