import type { GatewayEnv } from "./types";

export type ChainSummary = {
  id: string;
  code: string;
  name: string;
  enterprise_id?: string;
};

const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const enterpriseChainsCache = new Map<string, CacheEntry<ChainSummary[]>>();
const chainByCodeCache = new Map<string, CacheEntry<ChainSummary | null>>();

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function inventoryJson<T>(
  env: GatewayEnv,
  path: string
): Promise<T | null> {
  const url = new URL(path, "https://internal");
  const res = await env.INVENTORY.fetch(
    new Request(url.toString(), { method: "GET" })
  );
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function fetchEnterpriseChainsById(
  env: GatewayEnv,
  enterpriseId: string
): Promise<ChainSummary[]> {
  const normalized = enterpriseId.trim();
  const cached = cacheGet(enterpriseChainsCache, normalized);
  if (cached) return cached;

  const data = await inventoryJson<{ chains?: ChainSummary[] }>(
    env,
    `/v1/inventory/enterprises/by-id/${encodeURIComponent(normalized)}/chains`
  );
  const chains = data?.chains ?? [];
  cacheSet(enterpriseChainsCache, normalized, chains);
  return chains;
}

export async function resolveChainByCode(
  env: GatewayEnv,
  code: string
): Promise<ChainSummary | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const cached = cacheGet(chainByCodeCache, normalized);
  if (cached !== undefined) return cached;

  const data = await inventoryJson<{ chain?: ChainSummary }>(
    env,
    `/v1/inventory/chains/${encodeURIComponent(normalized)}`
  );
  const chain = data?.chain ?? null;
  cacheSet(chainByCodeCache, normalized, chain);
  return chain;
}

/** Test helper — clears in-memory caches between cases. */
export function clearInventoryClientCache() {
  enterpriseChainsCache.clear();
  chainByCodeCache.clear();
}
