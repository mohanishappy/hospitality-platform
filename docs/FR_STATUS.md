# Feature requirement status (tracker)

Aligned with [`REQUIREMENTS.md`](REQUIREMENTS.md) **§2** backlog and [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) phases 0–7 (complete); **Phase 8** complete (**8A–8E**).

| FR | Summary | Status |
|----|---------|--------|
| FR-D1 | Seed / critical-path tests | Vitest covers reservation + inventory validation; expand as APIs grow. |
| FR-D2 | README + Postman env vs collection vars | Documented in [`README.md`](../README.md) and [`postman/README.md`](../postman/README.md). |
| FR-R8 | List filters on reservations | **`GET /v1/reservations`**: `status`, `hotel_id`, `stay_from` + `stay_to` (overlap). Indexes in migration **0013**. |
| FR-O1 | Correlation ID | Gateway **`x-request-id`** (generate or forward); forwarded to Workers; echoed on responses. |
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
| FR-V5 | Soft holds (TTL) | **`POST …/room-types/{roomTypeId}/soft-holds`**, **`DELETE /v1/inventory/soft-holds/{holdId}`** — RPCs **`create_soft_hold`** / **`release_soft_hold`**; quote/calendar/search/create count active holds (**0015**). |
| FR-R11 | PATCH concurrency | **`reservation_stub.row_version`**; **GET** / **POST** create echo weak **`ETag`** derived from version; **PATCH** status / guest accept optional **`If-Match`** → **412** on mismatch (**0015**). |
| FR-R9 | Cancellation metadata | **`cancellation_reason`** enum + server-set **`cancelled_at`** on transition to **cancelled**; optional reason on **PATCH** status (**0016**). Refunds deferred. |
| FR-R10 | Reservation notes | **`internal_note`**, **`guest_note`** on **`reservation_stub`**; **`PATCH /v1/reservations/{id}/notes`** (**0016**). |
| FR-Z1 | Roles / scopes | Gateway route policies from JWT **`roles`** claim. **9B:** roles set by Post Login Action from **`staff_member.intended_role`** (not Auth0 RBAC per user). |
| FR-Z2 | M2M vs user | **`gty: client-credentials`** tokens with roles enforced: read + create only (no confirm/cancel/guest/notes write). |
| FR-Z3 | Enterprise + multi-brand | Migration **0017**: **`inventory.enterprise`**, chains linked by **`enterprise_id`**; gateway **`x-chain-ids`**; optional **`chain_id`** list filter; **`GET /v1/inventory/me/chains`**. See [`docs/AUTHORIZATION.md`](AUTHORIZATION.md). |
| FR-Z4 | DB staff brand grants + admin API | Migration **0018**; staff CRUD **shipped**; invite + DB-driven claims + Enterprise Admin Portal **9B–9D**. |
| FR-Z5 | Platform Portal enterprise bootstrap | Planned **9E**. |
| FR-Z6 | Manager-created brands | **9F shipped** — `POST/PATCH /admin/chains` + Brands tab UI |
| FR-O2 | Metrics / structured logs | Gateway **`withRequestMetrics`**: JSON log per request; **Workers Analytics Engine** binding **`ANALYTICS`** (**7D**). |
| FR-O3 | Readiness | **`GET /health/ready`**: JWKS + optional Supabase PostgREST ping (**7E**). |
| FR-D1 | CI / contract tests | Vitest; OpenAPI guard; public + golden-path smoke; **Newman** optional (**7G**). |
| FR-D2 | README / docs sync | **README** + **REQUIREMENTS §1** through migration **0016**. |
| FR-U1 | Guest/staff SPA | **8A–8D** shipped in **`apps/web`** (shell, booking, calendar, reservations UI); **8E** Pages deploy. |
| FR-U2 | Staff calendar UI | **Phase 8C** — read-only month grid from **`GET …/calendar`** (hotel + room type pickers). |

**Migrations:** apply through [`0019_staff_invite_db_roles.sql`](../supabase/migrations/0019_staff_invite_db_roles.sql). **`0020`** (demo pricing seed) — Phase **10B**.

**Phase 10:** see [`PHASE10_PLAN.md`](PHASE10_PLAN.md). **10A–10F** shipped (guest promo, BAR seed, catalog admin, Rates + Availability UI, checkout soft holds).

**Demo seed (0014 + 0020):** chain **`DEMO`** — **`LOS3`** (3+ nights @ **9000** cents/night on **DEMO-H1** `STD-QN`); **`SAVE5`** (500 bps off); all brands have **`base_rate_cents`** after **0020**.
