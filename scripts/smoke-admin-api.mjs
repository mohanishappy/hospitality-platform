#!/usr/bin/env node
/**
 * Admin catalog smoke (Phases 9F, 10C–10E): exercises manager admin APIs end-to-end.
 *
 * Env:
 *   GATEWAY_BASE_URL      — gateway root (default: VITE_GATEWAY_URL from apps/web/.env if present)
 *   SMOKE_MANAGER_TOKEN   — Bearer access token for a manager with staff:admin (required)
 *
 * Creates uniquely suffixed brand/hotel/room/rate/promo/block rows. Does not delete the brand
 * (safe to re-run; each run uses a new suffix).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadGatewayFromWebEnv() {
  const path = resolve(root, "apps/web/.env");
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^VITE_GATEWAY_URL=(.+)$/.exec(line.trim());
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

const base = (
  process.env.GATEWAY_BASE_URL ??
  loadGatewayFromWebEnv() ??
  ""
).replace(/\/+$/, "");
const token = process.env.SMOKE_MANAGER_TOKEN?.trim();
const suffix = Date.now().toString(36).toUpperCase().slice(-6);

if (!base) {
  console.error("Missing GATEWAY_BASE_URL (or apps/web/.env VITE_GATEWAY_URL)");
  process.exit(1);
}
if (!token) {
  console.error("Missing SMOKE_MANAGER_TOKEN (manager Bearer access token)");
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

async function request(method, path, { json, expect } = {}) {
  const init = {
    method,
    headers: { ...authHeaders },
    signal: AbortSignal.timeout(45_000),
  };
  if (json !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(json);
  }
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const expected = expect ?? [200, 201];
  const ok = expected.includes(res.status);
  return { res, body, ok, status: res.status };
}

function fail(label, detail) {
  console.error(`FAIL ${label}:`, detail);
  if (String(detail) === "404") {
    console.error(
      "Hint: 404 on admin routes usually means inventory/gateway need redeploy (npm run deploy:all)."
    );
  }
  process.exit(1);
}

function ok(label) {
  console.log(`OK   ${label}`);
}

console.log(`Admin API smoke → ${base} (suffix ${suffix})\n`);

const staff = await request("GET", "/v1/inventory/admin/staff");
if (!staff.ok) {
  fail(
    "GET /admin/staff (manager access)",
    `${staff.status} — token needs manager role + staff:admin`
  );
}
ok("GET /admin/staff");

const brandCode = `T${suffix}`.slice(0, 8);
const brand = await request("POST", "/v1/inventory/admin/chains", {
  json: {
    code: brandCode,
    name: `Smoke Test Brand ${suffix}`,
    default_currency: "USD",
  },
  expect: [201],
});
if (!brand.ok) fail("POST /admin/chains", brand.status);
const chainId = brand.body?.chain?.id;
if (!chainId) fail("POST /admin/chains", "missing chain.id");
ok(`POST /admin/chains (${brandCode})`);

const myChains = await request("GET", "/v1/inventory/me/chains");
if (!myChains.ok) fail("GET /me/chains", myChains.status);
const scopedChainId = myChains.body?.chains?.[0]?.id;
if (!scopedChainId) fail("GET /me/chains", "no chains in token scope");
ok("GET /me/chains");

const brandPatch = await request(
  "PATCH",
  `/v1/inventory/admin/chains/${scopedChainId}`,
  { json: { name: `Demo Chain smoke ${suffix}` }, expect: [200] }
);
if (!brandPatch.ok) fail("PATCH /admin/chains (scoped)", brandPatch.status);
ok("PATCH /admin/chains (scoped brand)");

const hotels = await request(
  "GET",
  `/v1/inventory/admin/chains/${scopedChainId}/hotels`
);
if (!hotels.ok) fail("GET /admin/chains/.../hotels", hotels.status);
ok("GET /admin/chains/.../hotels");

const hotel = await request(
  "POST",
  `/v1/inventory/admin/chains/${scopedChainId}/hotels`,
  {
    json: { code: `H${suffix}`.slice(0, 8), name: `Smoke Hotel ${suffix}` },
    expect: [201],
  }
);
if (!hotel.ok) fail("POST /admin/hotels", hotel.status);
const hotelId = hotel.body?.hotel?.id;
if (!hotelId) fail("POST /admin/hotels", "missing hotel.id");
ok("POST /admin/hotels");

const hotelPatch = await request(
  "PATCH",
  `/v1/inventory/admin/hotels/${hotelId}`,
  {
    json: { booking_min_los: 1, booking_max_los: 14 },
    expect: [200],
  }
);
if (!hotelPatch.ok) fail("PATCH /admin/hotels", hotelPatch.status);
ok("PATCH /admin/hotels (policies)");

const room = await request(
  "POST",
  `/v1/inventory/admin/hotels/${hotelId}/room-types`,
  {
    json: {
      code: `R${suffix}`.slice(0, 8),
      name: `Smoke Room ${suffix}`,
      capacity: 2,
      units_total: 5,
      base_rate_cents: 15000,
      tax_rate_bps: 800,
      fee_fixed_cents: 500,
    },
    expect: [201],
  }
);
if (!room.ok) fail("POST /admin/room-types", room.status);
const roomTypeId = room.body?.room_type?.id;
if (!roomTypeId) fail("POST /admin/room-types", "missing room_type.id");
ok("POST /admin/room-types");

const roomPatch = await request(
  "PATCH",
  `/v1/inventory/admin/room-types/${roomTypeId}`,
  { json: { base_rate_cents: 15500 }, expect: [200] }
);
if (!roomPatch.ok) fail("PATCH /admin/room-types", roomPatch.status);
ok("PATCH /admin/room-types");

const plan = await request(
  "POST",
  `/v1/inventory/admin/chains/${scopedChainId}/rate-plans`,
  {
    json: {
      code: `L${suffix}`.slice(0, 6),
      label: "Smoke LOS",
      valid_from: "2020-01-01",
      priority: 5,
    },
    expect: [201],
  }
);
if (!plan.ok) fail("POST /admin/rate-plans", plan.status);
const ratePlanId = plan.body?.rate_plan?.id;
if (!ratePlanId) fail("POST /admin/rate-plans", "missing rate_plan.id");
ok("POST /admin/rate-plans");

const tiers = await request(
  "PUT",
  `/v1/inventory/admin/rate-plans/${ratePlanId}/los-tiers`,
  {
    json: { tiers: [{ min_nights: 2, nightly_rate_cents: 12000 }] },
    expect: [200],
  }
);
if (!tiers.ok) fail("PUT /admin/rate-plans/.../los-tiers", tiers.status);
ok("PUT /admin/rate-plans/.../los-tiers");

const planGet = await request(
  "GET",
  `/v1/inventory/admin/rate-plans/${ratePlanId}`
);
if (!planGet.ok) fail("GET /admin/rate-plans/:id", planGet.status);
ok("GET /admin/rate-plans/:id");

const promo = await request(
  "POST",
  `/v1/inventory/admin/chains/${scopedChainId}/promotions`,
  {
    json: {
      code: `P${suffix}`.slice(0, 6),
      label: "Smoke 5% off",
      discount_percent_bps: 500,
      valid_from: "2020-01-01",
    },
    expect: [201],
  }
);
if (!promo.ok) fail("POST /admin/promotions", promo.status);
const promoId = promo.body?.promotion?.id;
if (!promoId) fail("POST /admin/promotions", "missing promotion.id");
ok("POST /admin/promotions");

const promoPatch = await request(
  "PATCH",
  `/v1/inventory/admin/promotions/${promoId}`,
  { json: { active: true }, expect: [200] }
);
if (!promoPatch.ok) fail("PATCH /admin/promotions", promoPatch.status);
ok("PATCH /admin/promotions");

const block = await request(
  "POST",
  `/v1/inventory/admin/room-types/${roomTypeId}/blocks`,
  {
    json: {
      start_date: "2030-06-01",
      end_date: "2030-06-03",
      units_reduced: 1,
      label: "smoke block",
    },
    expect: [201],
  }
);
if (!block.ok) fail("POST /admin/blocks", block.status);
const blockId = block.body?.block?.id;
if (!blockId) fail("POST /admin/blocks", "missing block.id");
ok("POST /admin/blocks");

const blocks = await request(
  "GET",
  `/v1/inventory/admin/room-types/${roomTypeId}/blocks`
);
if (!blocks.ok) fail("GET /admin/blocks", blocks.status);
ok("GET /admin/blocks");

const blockDel = await request(
  "DELETE",
  `/v1/inventory/admin/blocks/${blockId}`,
  { expect: [200, 204] }
);
if (!blockDel.ok) fail("DELETE /admin/blocks", blockDel.status);
ok("DELETE /admin/blocks");

const invite = await request("POST", "/v1/inventory/admin/staff/invite", {
  json: {
    email: `smoke-${suffix.toLowerCase()}@plg.demo`,
    intended_role: "front_desk",
    all_chains: true,
    display_name: `Smoke invite ${suffix}`,
  },
  expect: [201],
});
if (!invite.ok) fail("POST /admin/staff/invite", invite.status);
if (!invite.body?.invite?.accept_url) {
  fail("POST /admin/staff/invite", "missing accept_url");
}
ok("POST /admin/staff/invite");

console.log(`
All admin API smoke checks passed.

Created brand: ${brandCode} (${chainId})
Catalog ops on scoped brand: ${scopedChainId}
Hotel: ${hotelId} · Room type: ${roomTypeId}
Invite (pending): ${invite.body.invite.email}
Accept URL: ${invite.body.invite.accept_url}

Guest search on the new brand may take ~60s (gateway cache) before hits appear on /c/${brandCode}.
`);
