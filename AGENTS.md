# AGENTS.md — Hospitality Platform

Reference for AI agents and developers working in this repository. Read this first, then follow links into canonical docs.

---

## What this application is

A **multi-brand hospitality booking platform**: guests search, quote, and book stays; staff manage availability, reservations, and (in progress) tenant administration. External clients talk to a **single gateway**; backend workers are internal.

**Business model (target):**

- **Platform ops** onboard hotel groups (enterprises) via a Platform Portal.
- **Enterprise admins** create brands (chains), invite staff, assign roles and brand scope.
- **Guests and staff** use brand sites at `/c/:chainCode` and enterprise hubs at `/e/:code`.

---

## Repository layout

| Path | Role |
|------|------|
| `services/gateway` | Public API — JWT verify, authz, chain scope, forward to workers |
| `services/inventory` | Catalog, availability, search, calendar, soft holds, enterprise/staff admin |
| `services/reservations` | Reservation CRUD, status, guest, notes, idempotency |
| `apps/web` | Vite + React SPA (Auth0) — booking, calendar, staff reservations |
| `supabase/migrations` | Postgres schema + RPCs (`inventory`, `reservations` schemas) |
| `tests/` | Vitest unit tests (import from `services/*/src`) |
| `scripts/` | Post-deploy smoke, golden-path smoke, Newman |
| `postman/` | Collection + environment for manual/API testing |
| `docs/` | Requirements, implementation plan, auth design, FR status |

**Contract source of truth:** `services/gateway/src/openapi.json` (also `GET /openapi.json`, `GET /docs` on gateway).

---

## Platforms and technology

### Production stack (in use)

| Platform | Purpose | Notes |
|----------|---------|--------|
| **Cloudflare Workers** | Gateway, inventory, reservations | Hono apps; deploy with Wrangler 4.x |
| **Cloudflare Pages** | `apps/web` SPA | `wrangler pages deploy`; `_redirects` for SPA routing |
| **Cloudflare Analytics Engine** | Request metrics | Gateway binding `ANALYTICS` |
| **Supabase (Postgres)** | Primary database | Accessed via PostgREST + `supabase-js` with **service_role** in workers only |
| **Auth0** | Identity (SPA + M2M) | JWT audience = API identifier; Post Login Action sets custom claims |
| **GitHub Actions** | CI/CD | Test → migrate (main) → deploy workers + web → smoke |

### Application runtime

| Layer | Technology |
|-------|------------|
| Workers | **TypeScript**, **Hono**, **jose** (JWKS JWT verify), **@supabase/supabase-js** |
| SPA | **React 19**, **Vite 6**, **@auth0/auth0-react** |
| Tests | **Vitest** (root `npm test`) |
| API contract | **OpenAPI 3.0** |
| Errors | **RFC 7807** `application/problem+json` via shared `problem()` helpers |
| Node | **20+** (CI and local) |

### Platform options considered / deferred

| Option | Decision |
|--------|----------|
| **Separate authz service** (SpiceDB, OPA, `services/authz`) | **No for now** — gateway PEP + inventory grant data. Revisit for hotel-level ACLs or compliance engines. |
| **Auth0 Organizations** per enterprise | **Deferred** — DB-driven tenancy + invites first; Orgs for enterprise SSO later. |
| **Auth0 Management API** on every invite | **Rejected** — email invite + DB `intended_role`; Auth0 = identity only. |
| **Auth0 RBAC** per staff user | **Deprecated (9B+)** — roles copied from DB onto JWT by Post Login Action. |
| **Shared npm `lib/` across workers** | **Avoid** — each service includes only `src/`; duplicate small helpers (e.g. `uuid.ts`) per service to keep `tsc` happy. |
| **Email** | **Planned 9C** — Resend or SendGrid via Wrangler secret |

---

## Documentation map

Read in this order when onboarding or planning work:

| Document | Contents |
|----------|----------|
| [`README.md`](README.md) | Setup: Supabase, Auth0, Cloudflare deploy, secrets, smoke tests |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Functional requirements (FR IDs) — as-built + backlog |
| [`docs/FR_STATUS.md`](docs/FR_STATUS.md) | Which FRs are shipped vs planned |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Phased delivery (Phases 0–9+) |
| [`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md) | **Canonical auth/tenancy design** — enterprise, staff, invites, gateway scope |
| [`docs/PHASE9_PLAN.md`](docs/PHASE9_PLAN.md) | Active work: portals, invite flow, 9B implementation checklist |
| [`postman/README.md`](postman/README.md) | Postman variables and flows |

---

## Architecture patterns

### Gateway as single front door (FR-A1)

- All external HTTP goes to **gateway** only.
- Gateway verifies Auth0 JWT, resolves **enterprise + brand scope**, enforces **route permissions**, forwards to inventory/reservations via **Cloudflare service bindings** (same path prefix `/v1/...`).
- Workers trust **gateway-injected headers**, not raw client JWTs:
  - `x-chain-id`, `x-chain-ids`, `x-enterprise-id`, `x-user-email`, `x-roles`, `x-request-id`

### Database schemas

- **`inventory`** — enterprises, chains (brands), hotels, room types, rate plans, staff, grants, soft holds.
- **`reservations`** — reservation stubs, guests, idempotency keys.
- Business logic for availability/pricing often lives in **SQL RPCs** (migrations), not only in TypeScript.
- Workers use **`SUPABASE_SERVICE_ROLE_KEY`** — never expose in the browser.

### Multi-tenant model

| Concept | DB / route | Notes |
|---------|------------|--------|
| **Enterprise** | `inventory.enterprise` | Hotel group (e.g. PLG) |
| **Brand / chain** | `inventory.chain` | Bookable brand; `chain_id` on reservations |
| **Staff scope** | `staff_member` + `staff_chain_grant` | `all_chains` or explicit brand UUIDs |
| **Active brand** | SPA header **`x-chain-code`** | From URL `/c/HBR`; gateway resolves to UUID |

Demo enterprise UUID: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee` (Palladium Lodging Group).

### SPA routing

| Route | Purpose |
|-------|---------|
| `/` | Home |
| `/c/:chainCode` | Brand site — booking, calendar, reservations |
| `/e/:code` | Enterprise hub — brand picker + cross-brand staff tools |
| `/e/:code/admin/*` | Enterprise Admin Portal (**planned 9D**) |
| `/platform/*` | Platform Portal (**planned 9E**) |
| `/invite/accept?token=` | Invite accept (**planned 9B**) |

---

## Authorization (locked decisions)

Full detail: [`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md).

### Target model (Phase 9B+)

| Layer | Owns |
|-------|------|
| **Auth0** | Identity, MFA, SSO, **global user block** |
| **Database** | `intended_role`, enterprise membership, brand grants, invite lifecycle |
| **Post Login Action** | Calls `GET /v1/inventory/internal/staff/claims?email=` → sets JWT `enterprise_id` + `roles` |
| **Gateway** | Permission matrix from JWT `roles`; brand scope from DB via `/staff/access` |

**JWT custom claim namespace:** `https://hospitality.app/claims/` (`enterprise_id`, `roles`, `email`).

**Roles:** `guest`, `front_desk`, `manager`, `read_only`, `integration`, `platform_operator` (latter for Platform Portal).

**Do not:** assign Auth0 RBAC roles per staff member after 9B; put brand UUIDs in Auth0 metadata.

### Interim (until 9B ships)

Demo uses hardcoded `enterprise_id` in Action, manual Auth0 `manager` assignment, and SQL to set `staff_member.auth0_sub`. See README §2 “Interim setup”.

### Gateway permissions (examples)

- `staff:admin` → `/v1/inventory/admin/staff/*` (manager role)
- `platform:admin` → `/v1/inventory/platform/*` (**planned 9E**)
- M2M (`client-credentials`) → read + create reservations only (FR-Z2)

Staff access cache: **~60 seconds** on enterprise chains + staff lookup.

---

## Coding standards and patterns

### General

- **Minimize scope** — smallest correct diff; match surrounding code style.
- **Reuse** existing handlers, `problem()`, `supaClient()`, gateway forward patterns.
- **Comments** only for non-obvious business rules.
- **Tests** when behavior is non-trivial; Vitest at repo root imports from `services/*/src`.
- **Do not commit** unless the user asks. **Do not push** unless asked.

### TypeScript / Workers

- Framework: **Hono** per service; routes registered in `*-app.ts` or `index.ts`.
- Errors: `problem(status, title, detail, type?)` → RFC 7807 JSON.
- Validation: per-service `validation.ts`; UUID checks via local `uuid.ts` / `isUuidLike` (permissive for demo seed UUIDs).
- Inventory admin routes: `requireManager()` + `requireEnterpriseId()` from `admin-auth.ts` (reads `x-roles`, `x-enterprise-id` from gateway).
- New public routes: update **`services/gateway/src/authorization.ts`**, **`openapi.json`**, and tests.

### Gateway forwarding

Deploy order: **inventory → reservations → gateway** (bindings reference worker names in `wrangler.toml`).

### Database changes

- Add numbered migration under `supabase/migrations/` (next: **0019** invite + DB roles).
- Grant `service_role` on new tables (see `0003_service_role_grants.sql` pattern).
- Expose schemas in Supabase Data API: `public`, `inventory`, `reservations`.

### SPA

- Auth: `@auth0/auth0-react`; token access via `useGatewayToken` / `useAuthReady`.
- Permissions mirror gateway roles in `apps/web/src/lib/permissions.ts`.
- Chain context: `useAccessClaims`, `x-chain-code` on API calls from brand paths.
- Logout: origin-only Auth0 returnTo + `sessionStorage` restore (`lib/authReturn.ts`).

### API contract

- Keep **`openapi.json`** in sync with gateway routes.
- Postman collection updated for new flows when adding admin/platform endpoints.
- Dates: **YYYY-MM-DD**; stays half-open **`[check_in, check_out)`**.
- Reservation PATCH: optional **`If-Match`** / **ETag** for concurrency (FR-R11).

---

## Testing and CI

```bash
npm ci
npm test              # Vitest
npm run typecheck     # all services + web
npm run smoke:deploy  # public routes (needs GATEWAY_BASE_URL)
npm run smoke:api     # golden path (needs SMOKE_ACCESS_TOKEN)
npm run smoke:admin   # admin catalog API (needs SMOKE_MANAGER_TOKEN) — see docs/UI_TESTING.md
npm run e2e:admin     # Playwright admin UI (needs .env.e2e)
```

**CI (`.github/workflows/ci.yml`):** on every PR/push — test + typecheck; on **main** — Supabase `db push`, deploy workers + Pages, smoke.

---

## Active implementation (Phase 9)

Tracker: [`docs/PHASE9_PLAN.md`](docs/PHASE9_PLAN.md).

| Phase | Focus |
|-------|--------|
| **9A** | SPA `accessWarning` (local, ready to commit) |
| **9B** | Migration 0019, invite/accept, internal claims API, Action update, gateway zero-brand bypass |
| **9C** | Email delivery |
| **9D** | Enterprise Admin Portal (staff + brands UI) |
| **9E** | Platform Portal + `POST /v1/inventory/platform/enterprises` |
| **9F** | Admin brand CRUD API |
| **9G** | `enterprise.active`, cache/audit polish |

**Phase 10** (catalog, rates, booking UX): [`docs/PHASE10_PLAN.md`](docs/PHASE10_PLAN.md) — **10A/10B** in progress.

**9B checklist** is at the bottom of `PHASE9_PLAN.md`.

---

## Demo seed and local testing

- Chains: `DEMO`, `HBR`, `NWE`, `VCB` under PLG enterprise.
- Demo manager email: `manager@plg.demo` (seed `auth0_sub` placeholder until linked).
- Postman: set `access_token`, `gateway_base_url`, optional `chain_code` — see `postman/README.md`.
- Public booking routes require **`x-chain-code`** header without auth.

---

## Identified pitfalls (avoid)

1. **Zero-brand enterprise** — gateway currently 403s when enterprise has no chains; blocks new tenant admin until 9B bypass lands.
2. **Strict UUID validation** — demo UUIDs may fail RFC 4122 version check; use permissive `isUuidLike` in each service.
3. **Cross-service `lib/` imports** — break root `tsc`; keep helpers in each worker’s `src/`.
4. **Auth0 logout** — use site origin only for `returnTo`, not full path `/c/DEMO`.
5. **SPA on 403 from `/me/chains`** — do not wipe JWT roles; show `accessWarning` (9A).
6. **OpenAPI drift** — CI includes contract guard tests; update openapi when adding routes.

---

## Secrets (not in git)

| Secret | Where |
|--------|--------|
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` | Gateway Wrangler |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Inventory + reservations |
| `VITE_AUTH0_*`, `VITE_GATEWAY_URL` | Web build (GitHub Actions on main) |
| `ACTION_CLAIMS_SECRET` | Inventory + Auth0 Action (**9B**) |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | GitHub Actions migrate job |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions deploy |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-06-28 | Initial AGENTS.md — stack, docs map, auth decision, Phase 9, patterns |
