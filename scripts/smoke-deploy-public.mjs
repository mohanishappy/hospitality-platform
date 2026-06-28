#!/usr/bin/env node
/**
 * Post-deploy public smoke (Phase 7A): liveness, readiness, OpenAPI contract endpoint.
 * Usage: GATEWAY_BASE_URL=https://... node scripts/smoke-deploy-public.mjs
 */

const base = process.env.GATEWAY_BASE_URL?.replace(/\/+$/, "");
if (!base) {
  console.error("Missing GATEWAY_BASE_URL");
  process.exit(1);
}

const checks = [
  { path: "/health", expectJson: (j) => j.ok === true },
  { path: "/health/ready", expectJson: (j) => typeof j.ok === "boolean" },
  {
    path: "/openapi.json",
    expectJson: (j) => typeof j.openapi === "string" && j.paths && j.paths["/v1/reservations"],
  },
];

let failed = 0;

for (const { path, expectJson } of checks) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.error(`FAIL ${path}: HTTP ${res.status}`);
      failed++;
      continue;
    }
    const body = await res.json();
    if (!expectJson(body)) {
      console.error(`FAIL ${path}: unexpected body`, body);
      failed++;
      continue;
    }
    console.log(`OK   ${path}`);
  } catch (err) {
    console.error(`FAIL ${path}:`, err instanceof Error ? err.message : err);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed against ${base}`);
  process.exit(1);
}

console.log(`\nAll public smoke checks passed (${base})`);
