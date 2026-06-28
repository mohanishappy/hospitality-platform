# Phase 10 — Catalog, rates & booking UX

Canonical auth: [`AUTHORIZATION.md`](AUTHORIZATION.md). Prerequisite: Phase **9B–9D** (Enterprise Admin shell, manager JWT, brand CRUD **9F**).

**Goal:** Managers configure hotels, room types, rates, and availability without SQL; guests use promo codes and see realistic prices on brand sites.

**Strategy:** Ship **10A + 10B** first (guest value, no admin API). Then **10C–10E** (admin REST + Enterprise Admin tabs). **10F** hardens checkout with soft holds.

---

## Architecture (target)

```text
Enterprise Admin Portal  (/e/:code/admin)
├── Staff         (9D)
├── Brands        (9D + 9F)
├── Properties    (10C)  → hotels + room types
├── Rates         (10D)  → rate plans, LOS tiers, promotions
└── Availability  (10E)  → inventory blocks + booking policies

Brand booking site  (/c/:code)
├── Search (promo, hotel filter)     (10A)
├── Quote → confirm                  (10A; soft hold in 10F)
└── Staff calendar                   (existing)
```

**Admin scoping (all writes):**

1. `enterprise_id` from gateway header.
2. Target `chain_id` must belong to enterprise.
3. Staff with brand grants (not `all_chains`) may only mutate granted chains.
4. Hotel / room type / rate entities must belong to that chain.

**Permissions (v1):** Reuse gateway **`staff:admin`** + inventory **`requireManager()`** on `/v1/inventory/admin/*` catalog routes (same pattern as staff admin).

---

## Phase overview

| Phase | Focus | Duration | Depends on |
|-------|--------|----------|------------|
| **10A** | Guest booking quick wins | 2–3 days | — |
| **10B** | Demo pricing seed (migration **0020**) | 1 day | — |
| **10C** | Catalog admin API + Properties UI | **API + UI shipped**; OpenAPI pending |
| **10D** | Rate & promo admin API + Rates UI | **API + UI shipped**; OpenAPI pending | 10C |
| **10E** | Blocks + policies UI | **Blocks API + UI shipped**; hotel policies in Properties tab | 10C |
| **10F** | Soft holds in checkout + polish | 2–3 days | 10A |

---

## Phase 10A — Guest booking quick wins

### Deliverables

| Work | Detail |
|------|--------|
| Promo code input | Optional on search + checkout; wire `promotion_code` on search, availability, create |
| Rate plan passthrough | Echo `pricing.rate_plan_code` from search through availability + create |
| Hotel filter | Optional dropdown from `GET /hotels`; pass `hotel_ids` to search |
| Quote UX | Show rate plan, promo, fee line items in breakdown |
| Empty state | Clear copy when search returns no bookable hits |

### Exit

- Guest applies **SAVE5** on **DEMO** end-to-end.
- Wrong promo → clear API error; price mismatch → **409**.

### Checklist

- [x] `gateway.ts`: optional `promotion_code`, `rate_plan_code`, `hotelIds` on booking APIs
- [x] `BookingPanel`: promo + hotel filter + enriched quote
- [x] Postman/README note for guest promo flow

---

## Phase 10B — Demo pricing seed

### Migration **0020**

Idempotent `UPDATE` on `inventory.room_type`: `base_rate_cents`, `tax_rate_bps`, `fee_fixed_cents`, `units_total` for all seeded catalog rows.

### Exit

- `/c/HBR`, `/c/NWE`, `/c/VCB` search returns non-zero priced hits without Studio edits.

### Checklist

- [x] `0020_demo_pricing_seed.sql`
- [x] `FR_STATUS.md` / README migration note

---

## Phase 10C — Catalog admin (hotels & room types)

### API (proposed)

```http
GET    /v1/inventory/admin/chains/{chainId}/hotels
POST   /v1/inventory/admin/chains/{chainId}/hotels
GET    /v1/inventory/admin/hotels/{hotelId}
PATCH  /v1/inventory/admin/hotels/{hotelId}

GET    /v1/inventory/admin/hotels/{hotelId}/room-types
POST   /v1/inventory/admin/hotels/{hotelId}/room-types
GET    /v1/inventory/admin/room-types/{roomTypeId}
PATCH  /v1/inventory/admin/room-types/{roomTypeId}
```

Hotel PATCH includes booking policy fields (`booking_min_los`, `booking_max_los`, timezone, CTA/CTD, cutoff).

Room type POST/PATCH: `code`, `name`, `capacity`, `units_total`, `overbooking_allowance`, `base_rate_cents`, `tax_rate_bps`, `fee_fixed_cents`.

### UI — **Properties** tab at `/e/:code/admin/properties`

Brand picker → hotel list → room type list → edit forms.

### Exit

Manager creates room type with BAR; appears in public search within gateway cache TTL (~60s).

### FRs

| ID | Requirement |
|----|-------------|
| **FR-I8** | Manager admin CRUD for hotels |
| **FR-I9** | Manager admin CRUD for room types |

---

## Phase 10D — Rate & promotion admin

### API (proposed)

```http
GET/POST  /v1/inventory/admin/chains/{chainId}/rate-plans
GET/PATCH /v1/inventory/admin/rate-plans/{ratePlanId}
GET/PUT   /v1/inventory/admin/rate-plans/{ratePlanId}/los-tiers

GET/POST  /v1/inventory/admin/chains/{chainId}/promotions
PATCH     /v1/inventory/admin/promotions/{promotionId}
```

Validation: `room_type_id` ⇒ `hotel_id` required; unique plan/promo codes per chain; non-overlapping LOS tiers.

### UI — **Rates** tab at `/e/:code/admin/rates`

Rate plans + promotions sub-tabs; optional inline “test quote” using public availability API.

### Exit

Manager creates promo; guest applies via 10A promo field.

Closes admin gap on **FR-C1**, **FR-C2**, **FR-C3**.

---

## Phase 10E — Availability operations

### API (proposed)

```http
GET    /v1/inventory/admin/room-types/{roomTypeId}/blocks
POST   /v1/inventory/admin/room-types/{roomTypeId}/blocks
DELETE /v1/inventory/admin/blocks/{blockId}
```

Booking policies edited via hotel PATCH (10C); dedicated **Availability** tab UI.

### UI — `/e/:code/admin/availability`

Policy form + block list + embedded read-only calendar preview.

### Exit

Block reduces calendar remaining units; min LOS enforced in search.

---

## Phase 10F — Checkout hardening

| Work | Detail |
|------|--------|
| Soft hold on select | `POST …/soft-holds` after quote (TTL ~900s); release on abandon |
| Cache docs | Admin writes vs 60s gateway cache |
| Fee catalog | Defer full **FR-C4**; keep `fee_fixed_cents` |

---

## Schedule (after Phase 9)

| Week | Ship |
|------|------|
| W0 | **10A + 10B + 10C API** (in progress) |
| W1 | 10C API |
| W2 | 10C UI + 10D API |
| W3 | 10D UI + 10E |
| W4 | 10F + docs |

---

## Out of scope (Phase 10)

- Physical room numbers, OTA/channel manager, payments/refunds
- Full fee catalog (**FR-C4** complete)
- Dynamic pricing / yield management
- Platform Portal catalog (brands only at bootstrap)

---

## Implementation checklist (10C kickoff)

- [x] Handlers: `admin-hotels.ts`, `admin-room-types.ts`
- [x] Shared helpers in `admin-catalog.ts` (enterprise + brand scope)
- [x] Gateway + route-scope for `/admin/chains|hotels|room-types`
- [x] Postman **01c — Admin catalog**
- [ ] OpenAPI schemas for catalog routes
- [x] SPA: Properties tab UI (**10C**)
- [x] Vitest: gateway permission tests for catalog routes

**9F (Brands admin API + UI):** shipped with **10C** UI — `POST/PATCH /admin/chains`, Brands tab create/edit.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-06-28 | Initial Phase 10 plan; 10A/10B implementation started |
