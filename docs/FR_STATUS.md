# Feature requirement status (tracker)

Aligned with [`REQUIREMENTS.md`](REQUIREMENTS.md) **§2** backlog and [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) phases 0–2.

| FR | Summary | Status |
|----|---------|--------|
| FR-D1 | Seed / critical-path tests | Vitest covers reservation validation; expand as APIs grow. |
| FR-D2 | README + Postman env vs collection vars | Documented in [`README.md`](../README.md) and [`postman/README.md`](../postman/README.md). |
| FR-R8 | List filters on reservations | **`GET /v1/reservations`**: `status`, `hotel_id`, `stay_from` + `stay_to` (overlap). Indexes in migration **0013**. |
| FR-O1 | Correlation ID | Gateway **`x-request-id`** (generate or forward); forwarded to Workers; echoed on responses. |
| FR-O3 | Readiness | **`GET /health/ready`** — Auth0 JWKS fetch (no Supabase ping). |
| FR-C6 | Currency policy | **`inventory.chain.default_currency`** (default `USD`); quote/create use chain currency in RPC (**0013**). |
| FR-C5 | Persist quote on reservation | **`reservations.reservation_stub.pricing_snapshot`**; optional **`expected_total_cents`** on create → **409** on mismatch. |
| FR-C4 | Itemized fees | **`pricing_snapshot.fee_line_items`** (JSON array); fixed resort fee rolled into line items in RPC (**0013**). |

**Migrations:** apply through [`0013_pricing_snapshot_list_filters_chain_currency.sql`](../supabase/migrations/0013_pricing_snapshot_list_filters_chain_currency.sql).
