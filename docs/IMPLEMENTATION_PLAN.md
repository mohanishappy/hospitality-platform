# Implementation plan (backlog)

**Scope:** [`REQUIREMENTS.md`](REQUIREMENTS.md) **§2** (backlog). **§1** is already shipped (migrations through **0012**, gateway OpenAPI).

This is a **phased** plan: later phases depend on data model and API decisions from earlier ones. Adjust order if product priority differs (e.g. **FR-R8** before heavy commercial work).

---

## Phase 0 — Baseline (no feature code)

| Action | FRs touched |
|--------|-------------|
| Mark **§1** FRs as *implemented* in your tracker; add tests for critical paths (**FR-D1** seed). | FR-D1 |
| Align **README** + **postman/README** on env vs collection vars (**FR-D2**). | FR-D2 |

**Exit:** Single source of truth for what is done vs not.

---

## Phase 1 — Operations and API ergonomics (small, high leverage)

| Work | FRs | Notes |
|------|-----|--------|
| **List filters** on `GET /v1/reservations`: `status`, `hotel_id`, `check_in`/`check_out` range (indexed queries in SQL). | FR-R8 | Start minimal (one filter at a time); watch PII on guest email search. |
| **Correlation ID**: gateway generates or forwards `x-request-id` / `traceparent`; workers log it. | FR-O1 | No schema migration. |
| **Readiness** (optional): e.g. `GET /health/ready` that checks Auth0 JWKS cache + Supabase ping with timeouts. | FR-O3 | Keep response non-leaky. |

**Exit:** Staff-style listing works; logs are debuggable.

---

## Phase 2 — Commercial foundation (data model + quote parity)

| Work | FRs | Notes |
|------|-----|--------|
| **Currency + rounding policy** documented and applied consistently in quote RPC and any new pricing. | FR-C6 | May be chain- or hotel-level column + doc. |
| **Persist quote on reservation**: columns or JSON snapshot (`total_cents`, line items hash, or `quote_id` FK). Extend **create** to accept optional **quote token** or recompute and **409** if mismatch. | FR-C5 | Unlocks trust for checkout. |
| **Itemized fees** model: table `fee_definition` + application rules, or JSON array on quote; extend RPC and **POST** create. | FR-C4 | Depends on FR-C5 shape. |

**Exit:** “What we show” can match “what we store” for one rate path.

---

## Phase 3 — Rate plans and LOS (core product depth)

| Work | FRs | Notes |
|------|-----|--------|
| **Rate plan** entities: effective date ranges, attachment to hotel/room type, BAR fallback. | FR-C1 | Migration + admin seed or API for CRUD (out of scope unless you add admin routes). |
| **LOS tiers** in pricing RPC (nightly rate table or function of `nights`). | FR-C2 | Compose with **0012** nightly occupancy logic. |
| **Promotions** (optional slice): codes, blackout, min LOS — layer on top of plan resolution. | FR-C3 | Often last in pricing stack. |

**Exit:** Quotes vary by calendar and stay length, not only flat `base_rate_cents`.

---

## Phase 4 — Availability, search, policies

| Work | FRs | Notes |
|------|-----|--------|
| **Inventory blocks** table + subtract from nightly sellable cap in RPCs. | FR-V3 | Must align with **0012** counting. |
| **Booking policies**: `min_los`, `max_los`, `closed_to_arrival`, `cutoff_hours`, `hotel_timezone` — validate in quote + create. | FR-V4 | |
| **Search API**: `GET /v1/inventory/search` or similar — hotel(s), date range, optional `max_results`, sort by price or bookable. | FR-V1 | Uses pricing + occupancy from Phase 3–4. |
| **Calendar API**: per-day remaining units or bookable flag for one room type + month. | FR-V2 | May reuse nightly occupancy function in a loop or dedicated SQL. |

**Exit:** Guest-facing discovery without N round-trips per room type.

---

## Phase 5 — Holds and concurrency (optional, often payment-gated)

| Work | FRs | Notes |
|------|-----|--------|
| **Soft holds** with TTL (Redis or DB + cron), decrement available slots or use hold rows excluded from capacity. | FR-V5 | Pair with payment webhook later. |
| **ETags** or `If-Match` on **PATCH** reservation/guest. | FR-R11 | |

---

## Phase 6 — Reservation metadata and auth hardening

| Work | FRs | Notes |
|------|-----|--------|
| **Cancellation reason** enum + optional `cancelled_at` metadata. | FR-R9 | Refund state waits on payments epic. |
| **Notes** table or columns (`internal_note`, `guest_note`). | FR-R10 | |
| **Auth0 Action + gateway**: map **roles/scopes** to route allow-lists; M2M vs user (**FR-Z2**). | FR-Z1, FR-Z2 | |

---

## Phase 7 — Observability and CI quality

| Work | FRs | Notes |
|------|-----|--------|
| **Metrics**: Workers Analytics Engine, or Logpush, or third-party; p50/p95 latency, 5xx by route. | FR-O2 | |
| **CI integration tests**: deploy preview or mock Supabase; golden-path **curl** or contract tests. (Unit tests + typecheck already run in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).) | FR-D1 | |

---

## Phase 8 — Clients

| Work | FRs | Notes |
|------|-----|--------|
| **SPA** (Auth0 + gateway): booking flow using search + quote + create. | FR-U1 | |
| **Calendar / inventory UI** for staff. | FR-U2 | Depends on **FR-V1** / **FR-V2**. |

---

## Backlog coverage (every §2 FR → phase)

| FR | Phase | Topic |
|----|-------|--------|
| FR-C1 | 3 | Rate plans |
| FR-C2 | 3 | LOS pricing |
| FR-C3 | 3 | Promotions |
| FR-C4 | 2 | Itemized fees |
| FR-C5 | 2 | Persist quote |
| FR-C6 | 2 | Currency / rounding |
| FR-V1 | 4 | Multi-room / hotel search |
| FR-V2 | 4 | Calendar API |
| FR-V3 | 4 | Inventory blocks |
| FR-V4 | 4 | Booking policies + timezone |
| FR-V5 | 5 | Soft holds |
| FR-R8 | 1 | Reservation list filters |
| FR-R9 | 6 | Cancellation metadata (+ refunds when payments exist) |
| FR-R10 | 6 | Reservation notes |
| FR-R11 | 5 | PATCH concurrency (ETags) |
| FR-Z1 | 6 | Roles / scopes |
| FR-Z2 | 6 | M2M vs user policies |
| FR-O1 | 1 | Correlation IDs |
| FR-O2 | 7 | Metrics |
| FR-O3 | 1 | Readiness |
| FR-D1 | 0 + 7 | Tracker + unit tests (done); integration tests in 7 |
| FR-D2 | 0 | README / Postman alignment |
| FR-U1 | 8 | SPA |
| FR-U2 | 8 | Staff calendar UI (after FR-V1/V2) |

## Suggested sequencing (summary)

1. **Phase 0** — FR-D2 + tracker hygiene; **FR-D1** integration tests deferred to Phase 7.  
2. **Phase 1** — FR-R8, FR-O1, FR-O3 (ops + debuggability).  
3. **Phase 2** — FR-C5, FR-C6, FR-C4 (trust + money shape).  
4. **Phase 3** — FR-C1, FR-C2, FR-C3 (revenue logic).  
5. **Phase 4** — FR-V3, FR-V4, FR-V1, FR-V2 (discovery + policies).  
6. **Phase 5** — FR-V5, FR-R11 (holds + concurrency).  
7. **Phase 6** — FR-R9, FR-R10, FR-Z1, FR-Z2 (metadata + auth).  
8. **Phase 7** — FR-O2, FR-D1 (integration layer).  
9. **Phase 8** — FR-U1, FR-U2 (clients).

**Not realistic as one sprint:** full **§2** is a **multi-quarter** program; ship **phases as release trains** (e.g. quarterly: 0–2, then 3–4, etc.).

---

## Revision history

| Date | Change |
|------|--------|
| 2026-04-12 | Initial phased plan for REQUIREMENTS §2. |
| 2026-04-12 | Backlog coverage table: every §2 FR mapped to a phase. |
| 2026-04-07 | Phases **3–4** implemented in migration **0014** + gateway/inventory/reservations: rate plans, LOS tiers, promotions, blocks, policies, **GET /v1/inventory/search**, **GET …/calendar**; quote/create accept **`rate_plan_code`** / **`promotion_code`**. |
| 2026-04-07 | Phase **5**: migration **0015** (soft holds + **`row_version`**); inventory soft-hold HTTP routes; reservations **ETag** / **If-Match** on GET + PATCH. |
