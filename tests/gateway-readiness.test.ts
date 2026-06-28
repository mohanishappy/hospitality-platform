import { describe, expect, it, vi, afterEach } from "vitest";
import {
  checkJwks,
  checkSupabase,
  runReadinessChecks,
} from "../services/gateway/src/readiness.ts";

describe("checkJwks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails when auth0 config missing", async () => {
    const r = await checkJwks(undefined, "aud");
    expect(r.ok).toBe(false);
    expect(r.checks.auth0_config).toBe(false);
  });

  it("passes when JWKS fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const r = await checkJwks("tenant.auth0.com", "https://api");
    expect(r.ok).toBe(true);
    expect(r.checks.jwks).toBe(true);
  });
});

describe("checkSupabase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips when env vars absent", async () => {
    const r = await checkSupabase({});
    expect(r.ok).toBe(true);
    expect(r.checks.supabase).toBe("skipped");
  });

  it("passes when PostgREST responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const r = await checkSupabase({
      SUPABASE_URL: "https://proj.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    });
    expect(r.ok).toBe(true);
    expect(r.checks.supabase).toBe(true);
  });
});

describe("runReadinessChecks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aggregates jwks + skipped supabase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const r = await runReadinessChecks({
      AUTH0_DOMAIN: "t.auth0.com",
      AUTH0_AUDIENCE: "https://api",
      INVENTORY: {} as Fetcher,
      RESERVATIONS: {} as Fetcher,
    });
    expect(r.ok).toBe(true);
    expect(r.checks.jwks).toBe(true);
    expect(r.checks.supabase).toBe("skipped");
  });
});
