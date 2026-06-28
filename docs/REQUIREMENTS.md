# Functional requirements — Hospitality Platform API

This document captures **functional requirements** (FRs) for the gateway-backed API: inventory (hotels, room types, availability/quote, search, calendar) and reservations. **§1** reflects the **as-built** behavior as of Supabase migration **`0016`** and the gateway OpenAPI contract. **§2** is a **prioritized backlog** (several items are now shipped — see [`FR_STATUS.md`](FR_STATUS.md)).

**Contract source:** `services/gateway/src/openapi.json`  
**Migrations:** `supabase/migrations/` (through `0016_cancellation_notes.sql`)  
**Backlog implementation order:** see [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

---

## 1. Current release (as-built)

### 1.1 Tenancy and authentication

| ID | Requirement |
|----|-------------|
| **FR-A1** | Clients integrate with the **gateway** only; inventory and reservation workers are internal (service bindings), not the public HTTP contract for external clients. |
| **FR-A2** | Protected routes require a **Bearer** access token whose `aud` matches the configured Auth0 API (`AUTH0_AUDIENCE`). |
| **FR-A3** | The token carries **`https://hospitality.app/claims/enterprise_id`**. The gateway loads allowed brand UUIDs from inventory (enterprise catalog + **`inventory.staff_member`** grants for staff) and injects **`x-chain-ids`** and active **`x-chain-id`**. Legacy tokens may still use **`chain_id`** / **`chain_ids`** when **`enterprise_id`** is absent. See [`docs/AUTHORIZATION.md`](AUTHORIZATION.md). |
| **FR-A4** | Path and body identifiers (`hotel_id`, etc.) must belong to the token’s chain; wrong chain yields **404** (or equivalent) as implemented. |
| **FR-A5** | **`GET /health`**, **`GET /health/ready`**, **`GET /openapi.json`**, and **`GET /docs`** are available without authentication. |
| **FR-A6** | When the access token includes claim **`https://hospitality.app/claims/roles`**, the gateway enforces route policies (**`read_only`**, **`front_desk`**, **`manager`**, **`integration`**). Tokens **without** a roles claim retain full access (soft rollout). |

### 1.2 Inventory — catalog

| ID | Requirement |
|----|-------------|
| **FR-I1** | **List hotels** for the caller’s chain: `GET /v1/inventory/hotels`. |
| **FR-I2** | **Get hotel by id** for that chain: `GET /v1/inventory/hotels/{id}` (**404** if not in chain). |
| **FR-I3** | **List room types** for a hotel: `GET /v1/inventory/hotels/{hotelId}/room-types` (**404** if hotel not in chain). |
| **FR-I4** | Room type list includes inventory and commercial fields after migration **0012**: **`units_total`**, **`overbooking_allowance`**, **`base_rate_cents`**, **`currency`**, **`tax_rate_bps`**, **`fee_fixed_cents`**. |

### 1.3 Inventory — availability and quote

| ID | Requirement |
|----|-------------|
| **FR-I5** | **Quote and nightly bookability** for one room type and stay: `GET /v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/availability?check_in=&check_out=` with dates **YYYY-MM-DD** and **`check_out`** strictly after **`check_in`**. Optional query **`rate_plan_code`** and **`promotion_code`** align pricing with **`POST /v1/reservations`**. |
| **FR-I6** | Stays use half-open intervals **`[check_in, check_out)`**. Capacity is **per night**: overlapping **pending** and **confirmed** reservations on each night must not exceed **`units_total` + `overbooking_allowance` − inventory blocks** (`inventory.inventory_block`). |
| **FR-I7** | Response includes **bookable**, occupancy summary (e.g. tightest night), and **pricing**: **rate plans** (BAR fallback, optional **LOS** tier **`nightly_rate_cents`**), optional **promotions**, then **`tax_rate_bps`** on discounted room subtotal and **`fee_fixed_cents`** per stay (see OpenAPI **AvailabilityQuote** / **StayPricingQuote**). |

### 1.3b Inventory — search and calendar (phase 4)

| ID | Requirement |
|----|-------------|
| **FR-V1** | **Search** across room types / hotels: `GET /v1/inventory/search?check_in=&check_out=` with optional comma-separated **`hotel_ids`**, **`sort`** (`price` \| `bookable`), **`limit`** (1–100), and optional **`rate_plan_code`** / **`promotion_code`**. Rows omit hotels that fail **booking policy** validation for the stay. |
| **FR-V2** | **Calendar** view: `GET /v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/calendar?from=&to=` with half-open **`[from, to)`** — per-day **occupancy**, **blocks**, **soft_hold_units**, **remaining_units**, **bookable**. |

### 1.3c Inventory — soft holds (phase 5)

| ID | Requirement |
|----|-------------|
| **FR-V5** | **Soft hold** with TTL: `POST …/room-types/{roomTypeId}/soft-holds`, `DELETE /v1/inventory/soft-holds/{holdId}`; active holds reduce quoted/calendar availability until released or expired. |

### 1.4 Reservations — lifecycle and idempotency

| ID | Requirement |
|----|-------------|
| **FR-R1** | **Create reservation** requires header **`Idempotency-Key`**. First successful create returns **201** with **`idempotent_replay: false`**; replay with the same key and equivalent body returns **200** with **`idempotent_replay: true`**. |
| **FR-R2** | Create body includes **`hotel_id`**, **`room_type_id`**, **`check_in`**, **`check_out`** (date-only), nested **`guest`**, and optional **`rate_plan_code`** / **`promotion_code`** (must match server pricing when set), as validated by the service. |
| **FR-R3** | Create enforces the same **per-night** capacity rules as the availability quote path (aligned with migration **0012** RPCs). |
| **FR-R4** | **List reservations** for the chain supports **`limit`** (default 20, max 100), **`offset`** (default 0), and optional filters **`status`**, **`hotel_id`**, **`stay_from`** + **`stay_to`** (overlap window). List items omit embedded **guest**; use **GET by id** for guest PII. |
| **FR-R5** | **Get reservation by id** returns the reservation and nested **guest** for that chain. Response includes weak **`ETag`** derived from **`row_version`**. |
| **FR-R6** | **Patch reservation status** via `PATCH /v1/reservations/{id}` with JSON **`status`**: allowed transitions **`pending` → `confirmed` \| `cancelled`**, **`confirmed` → `cancelled`**, idempotent same-status no-op; invalid transition **409**. Optional **`cancellation_reason`** when cancelling; server sets **`cancelled_at`**. Optional **`If-Match`** → **412** on **`row_version`** mismatch. |
| **FR-R7** | **Patch guest** via `PATCH /v1/reservations/{id}/guest` with partial JSON; **`phone`** may be **`null`** to clear. Optional **`If-Match`**. |
| **FR-R9** | **Cancellation metadata** on **`reservation_stub`**: **`cancellation_reason`** enum, **`cancelled_at`** set on transition to **cancelled**. |
| **FR-R10** | **Reservation notes** via `PATCH /v1/reservations/{id}/notes`: **`internal_note`**, **`guest_note`** (nullable strings). |
| **FR-R11** | **Optimistic concurrency**: **`row_version`** on **`reservation_stub`**; **GET**/**POST** create echo **`ETag`**; **PATCH** accepts optional **`If-Match`**. |

### 1.5 API contract and errors

| ID | Requirement |
|----|-------------|
| **FR-E1** | Errors use **RFC 7807** **`application/problem+json`** (e.g. `type`, `title`, `detail`, `status`). |
| **FR-E2** | The public contract is exposed at **`GET /openapi.json`**; **`GET /docs`** serves Swagger UI with **Authorize** for Bearer testing. |

### 1.6 Supporting assets and data layer

| ID | Requirement |
|----|-------------|
| **FR-S1** | Postman artifacts under `postman/` support gateway testing, including **GET Room type availability & quote** and reservation flows; environment vs collection variables follow `postman/README.md`. |
| **FR-S2** | Supabase migrations through **0016** define schemas, RPCs, and grants; Workers use the **service role** and `supabase-js` with exposed schemas **`inventory`** and **`reservations`** (and **`public`** as needed). |

---

## 2. Backlog (not fully implemented)

Prioritize into releases (e.g. commercial → search → operations).

### 2.1 Commercial and pricing

| ID | Requirement |
|----|-------------|
| **FR-C1** | **Rate plans** (e.g. BAR, packages): rules attached to **room type** or **hotel** with effective date windows. *Shipped in DB + RPC (no admin REST CRUD).* |
| **FR-C2** | **Length-of-stay (LOS)** pricing (e.g. tiered nightly rates by stay length). *Shipped: `rate_plan_los_tier`.* |
| **FR-C3** | **Promotions / coupons** (optional): percentage or fixed discounts with constraints (minimum LOS, blackout dates). *Shipped: `promotion` table + optional code on quote/create/search.* |
| **FR-C4** | **Itemized fees** beyond a single **`fee_fixed_cents`** (e.g. resort, parking). *Partial: JSON line items + fixed fee; full fee catalog TBD.* |
| **FR-C5** | **Persist quoted amounts** on the reservation (or reference a quote snapshot) so confirmation matches what was displayed. *Shipped: **`pricing_snapshot`** + optional **`expected_total_cents`**.* |
| **FR-C6** | **Currency** policy: consistent currency per hotel or chain and explicit **rounding** rules in API responses. *Shipped: **`inventory.chain.default_currency`**.* |

### 2.2 Availability and search

| ID | Requirement |
|----|-------------|
| **FR-V1** | **Search** across multiple **room types** or **hotels** for a stay window (e.g. lowest price, filter by bookable). *Shipped: **§1.3b**.* |
| **FR-V2** | **Calendar-oriented** API: per-day availability or remaining units for planning UIs. *Shipped: **§1.3b**.* |
| **FR-V3** | **Inventory blocks** (maintenance, holds) that reduce sellable capacity without guest reservations. *Shipped: `inventory_block`.* |
| **FR-V4** | **Booking policies**: minimum/maximum LOS, closed-to-arrival/departure, same-day cutoff, **hotel timezone** awareness. *Shipped: hotel columns + validation in quote/create.* |
| **FR-V5** | **Soft hold** (optional): temporary inventory lock with TTL before payment or confirmation. *Shipped: **§1.3c**.* |

### 2.3 Reservations and guests

| ID | Requirement |
|----|-------------|
| **FR-R8** | **List filters**: by status, hotel, stay dates, guest identifiers (subject to privacy rules). *Shipped: status/hotel/stay window on **GET /v1/reservations**.* |
| **FR-R9** | **Cancellation** metadata (reason codes) and, if payments exist, **refund** state. *Shipped: reason + **`cancelled_at`**; refunds deferred.* |
| **FR-R10** | **Reservation notes** (internal vs guest-visible). *Shipped: **§1.4**.* |
| **FR-R11** | **Concurrency** semantics for **PATCH** (e.g. ETags or conflict responses) where concurrent edits matter. *Shipped: **§1.4**.* |

### 2.4 Authorization and roles

| ID | Requirement |
|----|-------------|
| **FR-Z1** | **Roles or scopes** beyond a single **`chain_id`** (e.g. front desk, revenue, read-only). *Shipped: gateway roles claim (**§1.1 FR-A6**).* |
| **FR-Z2** | Distinct policies for **machine (M2M)** vs **user** tokens for sensitive operations (create, confirm, cancel). *Shipped: M2M restricted when roles enforced.* |

### 2.5 Observability and reliability

| ID | Requirement |
|----|-------------|
| **FR-O1** | **Request / correlation IDs** propagated from gateway to workers for log correlation. |
| **FR-O2** | **Metrics** (latency, error rates by route) and optional alerting. *Shipped: gateway structured JSON logs + **Analytics Engine** dataset (**7D**).* |
| **FR-O3** | **Readiness** checks beyond liveness **`/health`**, without exposing secrets. *Shipped: JWKS + optional Supabase ping on **`GET /health/ready`** (**7E**).* |

### 2.6 Developer experience

| ID | Requirement |
|----|-------------|
| **FR-D1** | **Automated** contract or integration tests in CI (staging or mocked dependencies). *Partial: Vitest + OpenAPI guard; post-deploy smoke; **golden-path `smoke-api.mjs`** (optional CI).* |
| **FR-D2** | Root **README** and Postman docs stay aligned on which variables live in **environment** vs **collection**. |

### 2.7 Client applications (dependent on API)

| ID | Requirement |
|----|-------------|
| **FR-U1** | **Guest or staff SPA** (e.g. Auth0 + gateway) for booking and management workflows. |
| **FR-U2** | **Calendar / inventory UI** consuming search and calendar APIs once **FR-V*** are available. |

---

## 3. Traceability

- Map product epics and user stories to **FR-xx** IDs.
- Mark each FR **implemented**, **partial**, or **not started** in your issue tracker.
- Non-functional requirements (SLOs, rate limits, data retention, compliance) should be documented separately as **NFRs**.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-04-12 | Initial document: §1 as-built through migration 0012; §2 backlog. |
| 2026-04-12 | Link to `IMPLEMENTATION_PLAN.md` for phased backlog delivery. |
| 2026-04-07 | §1 through migration **0014** (rate plans, promotions, blocks, policies, search, calendar); §2 notes for shipped **FR-C1–C3**, **FR-V1–V4**; **§1.3b** (**FR-V1/V2** as-built). |
| 2026-06-27 | §1 through **0016** (soft holds, ETags, cancellation, notes, roles); §2 marks shipped **FR-C5/C6**, **FR-V5**, **FR-R8–R11**, **FR-Z1/Z2**; Phase **7A/7C** CI contract + smoke. |
