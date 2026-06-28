import type { GatewayEnv } from "./types";

export type ReadinessChecks = {
  auth0_config?: boolean;
  jwks?: boolean;
  supabase?: boolean | "skipped";
};

export async function checkJwks(
  domain: string | undefined,
  audience: string | undefined
): Promise<{ ok: boolean; checks: ReadinessChecks }> {
  if (!domain || !audience) {
    return { ok: false, checks: { auth0_config: false } };
  }
  try {
    const res = await fetch(`https://${domain}/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, checks: { auth0_config: true, jwks: false } };
    }
    return { ok: true, checks: { auth0_config: true, jwks: true } };
  } catch {
    return { ok: false, checks: { auth0_config: true, jwks: false } };
  }
}

/** Minimal PostgREST ping; no row data required (FR-O3 / Phase 7E). */
export async function checkSupabase(
  env: Pick<GatewayEnv, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">
): Promise<{ ok: boolean; checks: Pick<ReadinessChecks, "supabase"> }> {
  const url = env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { ok: true, checks: { supabase: "skipped" } };
  }
  try {
    const res = await fetch(`${url}/rest/v1/chain?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Accept-Profile": "inventory",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { ok: false, checks: { supabase: false } };
    }
    return { ok: true, checks: { supabase: true } };
  } catch {
    return { ok: false, checks: { supabase: false } };
  }
}

export async function runReadinessChecks(
  env: GatewayEnv
): Promise<{ ok: boolean; checks: ReadinessChecks }> {
  const jwks = await checkJwks(env.AUTH0_DOMAIN, env.AUTH0_AUDIENCE);
  if (!jwks.ok) {
    return jwks;
  }
  const supa = await checkSupabase(env);
  const checks: ReadinessChecks = { ...jwks.checks, ...supa.checks };
  const ok = supa.ok;
  return { ok, checks };
}
