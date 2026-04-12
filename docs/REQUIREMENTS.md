# Functional requirements — Hospitality Platform API

This document captures **functional requirements** (FRs) for the gateway-backed API: inventory (hotels, room types, availability/quote) and reservations. **§1** reflects the **as-built** behavior as of Supabase migration **`0012`** and the gateway OpenAPI contract. **§2** is a **prioritized backlog** for future work.

**Contract source:** `services/gateway/src/openapi.json`  
**Migrations:** `supabase/migrations/` (through `0012_nightly_availability_and_commercial.sql`)  
**Backlog implementation order:** see [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

---

## 1. Current release (as-built)

### 1.1 Tenancy and authentication

| ID | Requirement |
|----|-------------|
| **FR-A1** | Clients integrate with the **gateway** only; inventory and reservation workers are internal (service bindings), not the public HTTP contract for external clients. |
| **FR-A2** | Protected routes require a **Bearer** access token whose `aud` matches the configured Auth0 API (`AUTH0_AUDIENCE`). |
| **FR-A3** | The token carries tenant identity in claim **`https://hospitality.app/claims/chain_id`** (UUID string). The gateway resolves `chain_id` and injects **`x-chain-id`** for workers. |
| **FR-A4** | Path and body identifiers (`hotel_id`, etc.) must belong to the token’s chain; wrong chain yields **404** (or equivalent) as implemented. |
| **FR-A5** | **`GET /health`**, **`GET /openapi.json`**, and **`GET /docs`** are available without authentication. |

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
| **FR-I5** | **Quote and nightly bookability** for one room type and stay: `GET /v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/availability?check_in=&check_out=` with dates **YYYY-MM-DD** and **`check_out`** strictly after **`check_in`**. |
| **FR-I6** | Stays use half-open intervals **`[check_in, check_out)`**. Capacity is **per night**: overlapping **pending** and **confirmed** reservations on each night must not exceed **`units_total` + `overbooking_allowance`**. |
| **FR-I7** | Response includes **bookable**, occupancy summary (e.g. tightest night), and **pricing** consistent with **`base_rate_cents` × nights**, **`tax_rate_bps`** on room subtotal, and **`fee_fixed_cents`** per stay (see OpenAPI schemas **AvailabilityQuote** and **StayPricingQuote**). |

### 1.4 Reservations — lifecycle and idempotency

| ID | Requirement |
|----|-------------|
| **FR-R1** | **Create reservation** requires header **`Idempotency-Key`**. First successful create returns **201** with **`idempotent_replay: false`**; replay with the same key and equivalent body returns **200** with **`idempotent_replay: true`**. |
| **FR-R2** | Create body includes **`hotel_id`**, **`room_type_id`**, **`check_in`**, **`check_out`** (date-only), and nested **`guest`** fields as validated by the service. |
| **FR-R3** | Create enforces the same **per-night** capacity rules as the availability quote path (aligned with migration **0012** RPCs). |
| **FR-R4** | **List reservations** for the chain supports **`limit`** (default 20, max 100) and **`offset`** (default 0). List items omit embedded **guest**; use **GET by id** for guest PII. |
| **FR-R5** | **Get reservation by id** returns the reservation and nested **guest** for that chain. |
| **FR-R6** | **Patch reservation status** via `PATCH /v1/reservations/{id}` with JSON **`status`**: allowed transitions **`pending` → `confirmed` \| `cancelled`**, **`confirmed` → `cancelled`**, idempotent same-status no-op; invalid transition **409**. |
| **FR-R7** | **Patch guest** via `PATCH /v1/reservations/{id}/guest` with partial JSON; **`phone`** may be **`null`** to clear. |

### 1.5 API contract and errors

| ID | Requirement |
|----|-------------|
| **FR-E1** | Errors use **RFC 7807** **`application/problem+json`** (e.g. `type`, `title`, `detail`, `status`). |
| **FR-E2** | The public contract is exposed at **`GET /openapi.json`**; **`GET /docs`** serves Swagger UI with **Authorize** for Bearer testing. |

### 1.6 Supporting assets and data layer

| ID | Requirement |
|----|-------------|
| **FR-S1** | Postman artifacts under `postman/` support gateway testing, including **GET Room type availability & quote** and reservation flows; environment vs collection variables follow `postman/README.md`. |
| **FR-S2** | Supabase migrations through **0012** define schemas, RPCs, and grants; Workers use the **service role** and `supabase-js` with exposed schemas **`inventory`** and **`reservations`** (and **`public`** as needed). |

---

## 2. Backlog (not fully implemented)

Prioritize into releases (e.g. commercial → search → operations).

### 2.1 Commercial and pricing

| ID | Requirement |
|----|-------------|
| **FR-C1** | **Rate plans** (e.g. BAR, packages): rules attached to **room type** or **hotel** with effective date windows. |
| **FR-C2** | **Length-of-stay (LOS)** pricing (e.g. tiered nightly rates by stay length). |
| **FR-C3** | **Promotions / coupons** (optional): percentage or fixed discounts with constraints (minimum LOS, blackout dates). |
| **FR-C4** | **Itemized fees** beyond a single **`fee_fixed_cents`** (e.g. resort, parking). |
| **FR-C5** | **Persist quoted amounts** on the reservation (or reference a quote snapshot) so confirmation matches what was displayed. |
| **FR-C6** | **Currency** policy: consistent currency per hotel or chain and explicit **rounding** rules in API responses. |

### 2.2 Availability and search

| ID | Requirement |
|----|-------------|
| **FR-V1** | **Search** across multiple **room types** or **hotels** for a stay window (e.g. lowest price, filter by bookable). |
| **FR-V2** | **Calendar-oriented** API: per-day availability or remaining units for planning UIs. |
| **FR-V3** | **Inventory blocks** (maintenance, holds) that reduce sellable capacity without guest reservations. |
| **FR-V4** | **Booking policies**: minimum/maximum LOS, closed-to-arrival/departure, same-day cutoff, **hotel timezone** awareness. |
| **FR-V5** | **Soft hold** (optional): temporary inventory lock with TTL before payment or confirmation. |

### 2.3 Reservations and guests

| ID | Requirement |
|----|-------------|
| **FR-R8** | **List filters**: by status, hotel, stay dates, guest identifiers (subject to privacy rules). |
| **FR-R9** | **Cancellation** metadata (reason codes) and, if payments exist, **refund** state. |
| **FR-R10** | **Reservation notes** (internal vs guest-visible). |
| **FR-R11** | **Concurrency** semantics for **PATCH** (e.g. ETags or conflict responses) where concurrent edits matter. |

### 2.4 Authorization and roles

| ID | Requirement |
|----|-------------|
| **FR-Z1** | **Roles or scopes** beyond a single **`chain_id`** (e.g. front desk, revenue, read-only). |
| **FR-Z2** | Distinct policies for **machine (M2M)** vs **user** tokens for sensitive operations (create, confirm, cancel). |

### 2.5 Observability and reliability

| ID | Requirement |
|----|-------------|
| **FR-O1** | **Request / correlation IDs** propagated from gateway to workers for log correlation. |
| **FR-O2** | **Metrics** (latency, error rates by route) and optional alerting. |
| **FR-O3** | **Readiness** checks beyond liveness **`/health`**, without exposing secrets (optional). |

### 2.6 Developer experience

| ID | Requirement |
|----|-------------|
| **FR-D1** | **Automated** contract or integration tests in CI (staging or mocked dependencies). |
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
