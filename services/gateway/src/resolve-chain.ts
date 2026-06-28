import type { GatewayEnv } from "./types";

export type ChainSummary = {
  id: string;
  code: string;
  name: string;
};

export async function resolveChainByCode(
  env: GatewayEnv,
  code: string
): Promise<ChainSummary | null> {
  const url = env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const normalized = code.trim().toUpperCase();
  const qs = new URLSearchParams({
    select: "id,code,name",
    code: `eq.${normalized}`,
    limit: "1",
  });

  const res = await fetch(`${url}/rest/v1/chain?${qs.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": "inventory",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const rows = (await res.json()) as ChainSummary[];
  const row = rows[0];
  if (!row?.id) return null;
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
  };
}
