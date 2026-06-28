#!/usr/bin/env node
/**
 * Golden-path API smoke (Phase 7B): hotels → quote → create → notes → confirm → cancel.
 *
 * Env:
 *   GATEWAY_BASE_URL   — gateway root (required)
 *   SMOKE_ACCESS_TOKEN — Bearer token with chain_id claim (required)
 *   CHECK_IN / CHECK_OUT — YYYY-MM-DD (optional; default 2026-09-01 / 2026-09-04)
 */

const base = process.env.GATEWAY_BASE_URL?.replace(/\/+$/, "");
const token = process.env.SMOKE_ACCESS_TOKEN?.trim();
const checkIn = process.env.CHECK_IN?.trim() || "2026-09-01";
const checkOut = process.env.CHECK_OUT?.trim() || "2026-09-04";
const idempotencyKey = crypto.randomUUID();

if (!base) {
  console.error("Missing GATEWAY_BASE_URL");
  process.exit(1);
}
if (!token) {
  console.error("Missing SMOKE_ACCESS_TOKEN");
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

async function request(method, path, { json, headers = {} } = {}) {
  const init = {
    method,
    headers: { ...authHeaders, ...headers },
    signal: AbortSignal.timeout(30_000),
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
  return { res, body };
}

function fail(label, detail) {
  console.error(`FAIL ${label}:`, detail);
  process.exit(1);
}

function ok(label) {
  console.log(`OK   ${label}`);
}

console.log(`Golden-path smoke → ${base}\n`);

const hotels = await request("GET", "/v1/inventory/hotels");
if (!hotels.res.ok) fail("GET /v1/inventory/hotels", hotels.res.status);
const hotelId = hotels.body?.hotels?.[0]?.id;
if (!hotelId) fail("GET /v1/inventory/hotels", "no hotels in chain");
ok("GET /v1/inventory/hotels");

const roomTypes = await request(
  "GET",
  `/v1/inventory/hotels/${hotelId}/room-types`
);
if (!roomTypes.res.ok) fail("GET room-types", roomTypes.res.status);
const roomTypeId = roomTypes.body?.room_types?.[0]?.id;
if (!roomTypeId) fail("GET room-types", "no room types");
ok("GET room-types");

const avail = await request(
  "GET",
  `/v1/inventory/hotels/${hotelId}/room-types/${roomTypeId}/availability?check_in=${checkIn}&check_out=${checkOut}`
);
if (!avail.res.ok) fail("GET availability", avail.res.status);
ok("GET availability");

const create = await request("POST", "/v1/reservations", {
  json: {
    hotel_id: hotelId,
    room_type_id: roomTypeId,
    check_in: checkIn,
    check_out: checkOut,
    guest: {
      first_name: "Smoke",
      last_name: "Test",
      email: `smoke-${idempotencyKey.slice(0, 8)}@example.com`,
    },
  },
  headers: { "Idempotency-Key": idempotencyKey },
});
if (create.res.status !== 201 && create.res.status !== 200) {
  fail("POST create", `${create.res.status} ${JSON.stringify(create.body)}`);
}
const reservationId = create.body?.reservation?.id;
if (!reservationId) fail("POST create", "missing reservation.id");
let etag = create.res.headers.get("ETag");
ok("POST create reservation");

const detail = await request("GET", `/v1/reservations/${reservationId}`);
if (!detail.res.ok) fail("GET reservation", detail.res.status);
etag = detail.res.headers.get("ETag") ?? etag;
ok("GET reservation");

const notes = await request("PATCH", `/v1/reservations/${reservationId}/notes`, {
  json: { guest_note: "smoke test" },
  headers: etag ? { "If-Match": etag } : {},
});
if (!notes.res.ok) fail("PATCH notes", notes.res.status);
etag = notes.res.headers.get("ETag") ?? etag;
ok("PATCH notes");

const confirm = await request("PATCH", `/v1/reservations/${reservationId}`, {
  json: { status: "confirmed" },
  headers: etag ? { "If-Match": etag } : {},
});
if (!confirm.res.ok) fail("PATCH confirm", confirm.res.status);
etag = confirm.res.headers.get("ETag") ?? etag;
ok("PATCH confirm");

const cancel = await request("PATCH", `/v1/reservations/${reservationId}`, {
  json: { status: "cancelled", cancellation_reason: "guest_request" },
  headers: etag ? { "If-Match": etag } : {},
});
if (!cancel.res.ok) fail("PATCH cancel", cancel.res.status);
if (cancel.body?.reservation?.status !== "cancelled") {
  fail("PATCH cancel", "status not cancelled");
}
if (!cancel.body?.reservation?.cancelled_at) {
  fail("PATCH cancel", "missing cancelled_at");
}
ok("PATCH cancel");

console.log(`\nGolden-path smoke passed (reservation ${reservationId})`);
