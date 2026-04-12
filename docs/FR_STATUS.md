# Feature requirement status (tracker)

Aligned with [`REQUIREMENTS.md`](REQUIREMENTS.md) **§2** backlog and [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) phases 0–4.

| FR | Summary | Status |
|----|---------|--------|
| FR-D1 | Seed / critical-path tests | Vitest covers reservation + inventory validation; expand as APIs grow. |
| FR-D2 | README + Postman env vs collection vars | Documented in [`README.md`](../README.md) and [`postman/README.md`](../postman/README.md). |
| FR-R8 | List filters on reservations | **`GET /v1/reservations`**: `status`, `hotel_id`, `stay_from` + `stay_to` (overlap). Indexes in migration **0013**. |
| FR-O1 | Correlation ID | Gateway **`x-request-id`** (generate or forward); forwarded to Workers; echoed on responses. |
| FR-O3 | Readiness | **`GET /health/ready`** — Auth0 JWKS fetch (no Supabase ping). |
| FR-C6 | Currency policy | **`inventory.chain.default_currency`** (default `USD`); quote/create use chain currency in RPC (**0013**+). |
| FR-C5 | Persist quote on reservation | **`reservations.reservation_stub.pricing_snapshot`**; optional **`expected_total_cents`** on create → **409** on mismatch. |
| FR-C4 | Itemized fees | **`pricing_snapshot.fee_line_items`** (JSON array); fixed resort fee rolled into line items in RPC. |
| FR-C1 | Rate plans | **`inventory.rate_plan`** (chain/hotel/room scope, validity, priority, optional **`nightly_rate_cents`**). Resolved in **`room_type_availability_quote`** / **`create_reservation_idempotent`**. No admin HTTP CRUD (manage via SQL/Studio). |
| FR-C2 | LOS pricing | **`inventory.rate_plan_los_tier`** (`min_nights`, `max_nights`, **`nightly_rate_cents`**). |
| FR-C3 | Promotions | **`inventory.promotion`** (percent + fixed discount, **`min_los`**, validity, **`blackout_dates`**). Optional **`promotion_code`** on quote/create/search. |
| FR-V3 | Inventory blocks | **`inventory.inventory_block`** subtracts **`units_reduced`** per night from sellable cap in quote, create, calendar, search. |
| FR-V4 | Booking policies | **`inventory.hotel`**: **`booking_min_los`**, **`booking_max_los`**, CTA/CTD weekday arrays (**0=Sun..6=Sat** in hotel TZ), **`booking_timezone`**, **`booking_same_day_cutoff_time`**. Enforced in quote + create; search skips non-complying hotels. |
| FR-V1 | Multi-hotel search | **`GET /v1/inventory/search`** — RPC **`inventory_search_stays`** (`hotel_ids`, `sort`, `limit`, optional rate/promo codes). |
| FR-V2 | Calendar API | **`GET /v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/calendar`** — RPC **`room_type_availability_calendar`** (`from`, `to` half-open). |

**Migrations:** apply through [`0014_phase3_phase4_rate_plans_search_policies.sql`](../supabase/migrations/0014_phase3_phase4_rate_plans_search_policies.sql).

**Demo seed (0014):** chain **`DEMO`** — rate plan **`LOS3`** (3+ night tier **9000** cents/night on **DEMO-H1** `STD-QN` when BAR is higher); promotion **`SAVE5`** (500 bps off).
