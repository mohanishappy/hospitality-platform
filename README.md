# hospitality-platform

Microservices on **Cloudflare Workers** with **Supabase Postgres** and **Auth0**. Optimized for **free tiers** and a fast first deploy.

## Layout

| Path | Role |
|------|------|
| `CODE_SCAFFOLD.md` | Legacy bundle reference (sources now live under `services/` and `supabase/`) |
| `services/gateway` | Validates Auth0 JWTs, forwards to workers via **service bindings** (same URL path) |
| `services/inventory` | Hotels + **room types** (list/detail under gateway) |
| `services/reservations` | **POST/PATCH/GET** reservations; list; **status** lifecycle; idempotent **201**/**200** on create |
| `supabase/config.toml` | Supabase CLI config (local dev / **`supabase db push`** to a linked project) |
| `supabase/migrations` | SQL: through **`0020`** — demo BAR seed; **`0019`** invite + DB roles; **`0016`** cancellation notes, soft holds, ETags, rate plans, search, calendar |
| `apps/web` | **Phase 8A–8D** SPA — Vite + React + Auth0; health, booking, calendar, staff reservations ([`.env.example`](apps/web/.env.example)) |
| `postman/` | Postman **collection** + **example environment** for gateway requests ([`postman/README.md`](postman/README.md)) |
| `docs/FR_STATUS.md` | Backlog **FR** status through phases **0–7** (what shipped vs planned) |
| `AGENTS.md` | Agent/developer reference — stack, docs map, patterns, auth decisions, Phase 9 |
| `scripts/smoke-deploy-public.mjs` | Post-deploy public smoke (`npm run smoke:deploy`; CI **smoke** job on `main`) |
| `scripts/smoke-api.mjs` | Golden-path booking smoke (`npm run smoke:api`; optional CI step with **`SMOKE_ACCESS_TOKEN`**) |
| `scripts/run-newman.mjs` | Newman Postman run (`npm run smoke:newman`; optional CI step) |

**API spec (gateway, public):** `GET /openapi.json` (OpenAPI 3.0); `GET /docs` (Swagger UI — use **Authorize** with a Bearer token for protected operations). Contract source: `services/gateway/src/openapi.json`.

## Prerequisites

- Node.js 20+
- [Cloudflare account](https://dash.cloudflare.com/) (Workers Free plan)
- [Supabase](https://supabase.com/) project (Free plan)
- [Auth0](https://auth0.com/) tenant (Free tier — confirm current limits)

## 1) Supabase

1. Create a project.
2. Run migrations in order in the SQL editor (or `supabase db push`): [`0001_init.sql`](supabase/migrations/0001_init.sql) through [`0020_demo_pricing_seed.sql`](supabase/migrations/0020_demo_pricing_seed.sql).
3. **Turn on the Data API** (REST / PostgREST): Dashboard → **Project Settings** → **Data API** — use **Enable** if the API is off. Your Workers call this layer; it must be on.
4. **Expose API schemas** (required for `supabase-js` `.schema(...)`): same **Data API** page (or **Project Settings → API** on older dashboards) → **Exposed schemas**. Include at least `public`, `inventory`, and `reservations` (comma-separated; keep existing entries like `public`). Save. Without this, hotels returns `Invalid schema: inventory`.  
   *Some UIs only show “Exposed schemas” after the Data API is enabled.*
5. If hotels still returns **500** after migrations + steps 3–4, confirm **`0003_service_role_grants.sql`** ran successfully, then wait a short time and retry (there is no universal “reload schema cache” control on every dashboard).
6. Copy **Project URL** and **service_role** key (Workers use server-side secrets only — never expose service_role in the browser).

### Database migrations (CLI or GitHub Actions)

The repo includes [`supabase/config.toml`](supabase/config.toml) so you can use the [Supabase CLI](https://supabase.com/docs/guides/cli) against a **remote** project (same migration files as manual SQL editor runs):

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

(`<PROJECT_REF>` is the id in the dashboard URL: `https://supabase.com/dashboard/project/<PROJECT_REF>`.)

**Automated apply on `main`:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs **`supabase link`** + **`supabase db push`** after tests pass and **before** Worker deploy (same push or **Run workflow** on `main`). Add these **repository secrets** so that job can run:

| Secret | Purpose |
|--------|---------|
| **`SUPABASE_ACCESS_TOKEN`** | [Account access token](https://supabase.com/dashboard/account/tokens) (CLI non-interactive auth). |
| **`SUPABASE_PROJECT_REF`** | Project **Reference ID** (Settings → General, or the dashboard URL). |
| **`SUPABASE_DB_PASSWORD`** | Database password (Settings → Database). |

**Manual only:** [`.github/workflows/migrate-db.yml`](.github/workflows/migrate-db.yml) runs the same steps via **Actions → Migrate database (Supabase) → Run workflow** when you need to apply migrations without a full CI run (e.g. hotfix schema before code, or a staging project with different secrets in a forked workflow).

## 2) Auth0

1. Create an **API** with identifier = your `AUTH0_AUDIENCE` (e.g. `https://hospitality-api`).
2. Create a **Single Page Application** for the booking/admin UI (and later a **second SPA** for Platform Portal — Phase **9E**).
3. Add a **Post Login Action** as described in **[`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md)**.

**Authorization model (target — Phase 9B):** Auth0 handles **identity only**. App **roles** and **enterprise_id** come from **`inventory.staff_member`** via a Post Login Action that calls inventory **`GET /v1/inventory/internal/staff/claims`**. **Do not assign Auth0 RBAC roles per staff member** once 9B ships — managers invite staff in the Enterprise Admin Portal. See **[`docs/PHASE9_PLAN.md`](docs/PHASE9_PLAN.md)**.

The SPA passes **`chain_code`** on login (from `/c/:chainCode`) via `authorizationParams`; the gateway uses **`x-chain-code`** on API calls to pick the active brand. Users must **log out and sign in again** after changing the Action.

### Interim setup (until Phase 9B ships)

For local/demo with migration **0018** seed rows only:

- Enable **RBAC** on your API (Settings → RBAC Settings → **Enable RBAC**). Define role names **`guest`**, **`front_desk`**, **`manager`**, **`read_only`** (names only — used on the JWT after 9B).
- **Manually assign** the **`manager`** role to demo users in Auth0 Dashboard.
- Use the **legacy Action** below (hardcoded PLG `enterprise_id`, reads Auth0 RBAC assignment).
- After first staff login, copy JWT **`sub`** and run SQL:

```sql
update inventory.staff_member
set auth0_sub = 'auth0|YOUR_SUB_HERE'
where email = 'manager@plg.demo';
```

Remove these manual steps from your runbook once **9B** (invite + DB-driven claims) is deployed.

### Target Post Login Action (Phase 9B)

Replace the legacy Action with one that loads claims from inventory (requires **`ACTION_CLAIMS_SECRET`** on inventory + Action secret):

```javascript
/**
 * Post Login — DB-driven enterprise_id + roles (see docs/AUTHORIZATION.md).
 * @param {Event} event
 * @param {PostLoginAPI} api
 */
exports.onExecutePostLogin = async (event, api) => {
  const ns = "https://hospitality.app/claims";
  const email = event.user.email;
  if (!email) return;

  const claimsUrl = `${event.secrets.INVENTORY_CLAIMS_URL}?email=${encodeURIComponent(email)}`;
  let enterpriseId = null;
  let roles = ["guest"];

  try {
    const res = await fetch(claimsUrl, {
      headers: { "x-action-secret": event.secrets.ACTION_CLAIMS_SECRET },
    });
    if (res.ok) {
      const body = await res.json();
      if (body.enterprise_id) enterpriseId = body.enterprise_id;
      if (Array.isArray(body.roles) && body.roles.length > 0) roles = body.roles;
    }
  } catch {
    /* fall back to guest */
  }

  api.accessToken.setCustomClaim(`${ns}/email`, email);
  api.idToken.setCustomClaim(`${ns}/email`, email);
  api.accessToken.setCustomClaim(`${ns}/roles`, roles);
  api.idToken.setCustomClaim(`${ns}/roles`, roles);
  if (enterpriseId) {
    api.accessToken.setCustomClaim(`${ns}/enterprise_id`, enterpriseId);
    api.idToken.setCustomClaim(`${ns}/enterprise_id`, enterpriseId);
  }
};
```

Action secrets: **`INVENTORY_CLAIMS_URL`** (gateway or inventory public URL + `/v1/inventory/internal/staff/claims`), **`ACTION_CLAIMS_SECRET`**.

### Legacy Action (interim demo only)

Demo enterprise id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee` (Palladium Lodging Group).

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const ns = "https://hospitality.app/claims";
  const ENTERPRISE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const assigned =
    event.authorization?.roles?.map((role) => role.name).filter(Boolean) ?? [];
  const roles = assigned.length > 0 ? assigned : ["guest"];
  api.accessToken.setCustomClaim(`${ns}/enterprise_id`, ENTERPRISE_ID);
  api.accessToken.setCustomClaim(`${ns}/roles`, roles);
  if (event.user.email) {
    api.accessToken.setCustomClaim(`${ns}/email`, event.user.email);
  }
  api.idToken.setCustomClaim(`${ns}/enterprise_id`, ENTERPRISE_ID);
  api.idToken.setCustomClaim(`${ns}/roles`, roles);
  if (event.user.email) {
    api.idToken.setCustomClaim(`${ns}/email`, event.user.email);
  }
};
```

Add the Action to the **Login** flow. The SPA requests scope **`openid profile email`**.

**Staff brand access (database)** — see **[`docs/AUTHORIZATION.md`](docs/AUTHORIZATION.md)**. Per-brand scope lives in Supabase ([`0018_staff_brand_access.sql`](supabase/migrations/0018_staff_brand_access.sql)). After **9B**, managers use **invite** in the Enterprise Admin Portal; until then use **`/v1/inventory/admin/staff`** or SQL. Guests are never restricted by brand — only by email on their reservations.

**Credentials Exchange Action (M2M)** — set **`enterprise_id`** only; register the client in **`inventory.integration_client`** with brand grants (same model as staff). M2M tokens without a roles claim keep legacy full API access at the gateway.

**After changing the Action, user metadata, or role model:** log out of the SPA (clears cached tokens), log in again, and **redeploy the gateway** (and reservations/inventory workers):

```bash
npm run deploy:gateway
npm run deploy:inventory
npm run deploy:reservations
```

The deployed gateway must include the **`guest`** role map — otherwise tokens with `roles: ["guest"]` get **403 Forbidden** on every route (including search).

**Quick JWT check:** decode the access token at [jwt.io](https://jwt.io) and confirm:

- `https://hospitality.app/claims/email` — login email (required for guest “my reservations”)
- `https://hospitality.app/claims/roles` — `["guest"]` for users without a staff row; staff roles from **`intended_role`** after **9B**
- `https://hospitality.app/claims/enterprise_id` — present for staff; PLG demo interim: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`
- JWT **`sub`** — linked to **`inventory.staff_member`** on invite accept (**9B**)

Legacy tokens may still include **`chain_id`** / **`chain_ids`** UUID claims; the gateway accepts those when **`enterprise_id`** is absent.

## 3) Cloudflare — first-time deploy order

Service bindings require the **target worker names** to exist. Deploy **inventory** and **reservations** first, then **gateway**.

```bash
cd services/inventory && npm install && npx wrangler deploy
cd ../reservations && npm install && npx wrangler deploy
cd ../gateway && npm install && npx wrangler deploy
```

Or from repo root after `npm install` in each service folder:

```bash
npm run deploy:all
```

### Secrets (gateway)

```bash
cd services/gateway
npx wrangler secret put AUTH0_DOMAIN      # e.g. dev-xxx.us.auth0.com
npx wrangler secret put AUTH0_AUDIENCE    # API identifier
# Optional (readiness Supabase ping):
# npx wrangler secret put SUPABASE_URL
# npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### Secrets (inventory + reservations)

```bash
cd services/inventory
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

cd ../reservations
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### Automated deploy (GitHub Actions)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on **every push and pull request**: **`npm ci`**, **`npm test`** (including OpenAPI contract guard), then **typechecks** all services including **`apps/web`**. On **`main`** only (push or **Run workflow**), it applies **Supabase migrations** (`supabase db push`), deploys **inventory → reservations → gateway**, deploys **`apps/web`** to **Cloudflare Pages** (when Auth0 secrets are set), then **post-deploy smoke** against **`GATEWAY_BASE_URL`**.

**Repository secrets** (GitHub → **Settings** → **Secrets and variables** → **Actions**):

| Secret | Value |
|--------|--------|
| **`SUPABASE_ACCESS_TOKEN`**, **`SUPABASE_PROJECT_REF`**, **`SUPABASE_DB_PASSWORD`** | Required for the **migrate** job on `main` (see [Database migrations](#database-migrations-cli-or-github-actions) above). |
| **`CLOUDFLARE_API_TOKEN`** | API token with **Workers Scripts: Edit** and **Cloudflare Pages: Edit** (and **Account: Read** if prompted). Create under [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) (e.g. “Edit Cloudflare Workers” template, scoped to the right account — add **Pages** permission). |
| **`CLOUDFLARE_ACCOUNT_ID`** | Cloudflare account ID (Workers dashboard URL or **Account Home** → right sidebar). |
| **`GATEWAY_BASE_URL`** | Deployed gateway root (no trailing slash) — **smoke** job after deploy; also **`VITE_GATEWAY_URL`** at web build time. |
| **`VITE_AUTH0_DOMAIN`**, **`VITE_AUTH0_CLIENT_ID`**, **`VITE_AUTH0_AUDIENCE`** | Auth0 SPA settings for **`apps/web`** production build. **Web deploy is skipped** on `main` when **`VITE_AUTH0_CLIENT_ID`** is unset. |
| **`SMOKE_ACCESS_TOKEN`** | Optional M2M token for golden-path **`smoke-api.mjs`** in CI; skipped when unset. |

**Not stored in GitHub:** Worker runtime secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH0_*`). Set those once per Worker with `wrangler secret put` (or the dashboard); CI only publishes new **code** bundles and runs **remote** DB migrations against the linked Supabase project.

You can re-run a deploy from the **Actions** tab (**Run workflow**) without pushing.

After deploy on `main`, CI runs public smoke then optional golden-path smoke. Locally:

```powershell
$env:GATEWAY_BASE_URL = "https://your-gateway.workers.dev"
npm run smoke:deploy
$env:SMOKE_ACCESS_TOKEN = "<access_token>"
npm run smoke:api
```

Optional gateway secrets for **`GET /health/ready`** Supabase ping: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same as workers).

## Postman

Import **`postman/hospitality-platform.postman_collection.json`**, create a **local** env (copy the example to `postman/hospitality-platform.local.postman_environment.json` — gitignored — see [**Local environment setup**](postman/README.md#local-environment-setup)), then set **`baseUrl`** and **`access_token`** in the **environment** (they override empty collection values). **`hotel_id`**, **`room_type_id`**, **`reservation_id`**, **`idempotency_key`**, optional **`rate_plan_code`** / **`promotion_code`**, **`search_hotel_ids`**, and **`calendar_from`** / **`calendar_to`** live on the **collection** by default (or in the env only when set to real values — never `""`). Full guide: [`postman/README.md`](postman/README.md).

Responses include **`x-request-id`** for correlation; send the same header to trace a request end-to-end.

## Web app (Phase 8A–8D + public booking)

Staff/guest **SPA** under [`apps/web`](apps/web): **path-based tenants** at **`/c/:chainCode`** (e.g. `/c/HBR`), anonymous **search → quote → book** via **`x-chain-code`**, optional Auth0 login for staff calendar and reservation tools.

1. In Auth0, create a **Single Page Application** (separate from M2M). Set **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins** to your app origin(s), e.g. `http://localhost:5173` and `https://hospitality-web.pages.dev` (production Pages URL after first deploy). The SPA uses **origin-only** callback and logout URLs (Auth0 requirement); brand paths like `/c/DEMO` are restored client-side after login/logout. Optional: add `https://your-pages.dev/*` to **Allowed Logout URLs** if you prefer Auth0 to redirect directly to deep links. Authorize the SPA for your API audience.
2. For user login, use the **Post Login Action** in [§2 Auth0](#2-auth0) (sets **`chain_id`**, **`roles`**, default **`guest`**, and requires **`email`** scope on the SPA).
3. Copy [`apps/web/.env.example`](apps/web/.env.example) → `apps/web/.env` and fill **`VITE_*`** values.
4. From repo root:

```bash
npm install
npm run dev:web
```

Open `http://localhost:5173` for the brand picker, or go directly to e.g. `http://localhost:5173/c/DEMO` to book without logging in. Sign in on a chain page to view **My reservations**; staff roles also see availability and reservation management on that chain.

**Public booking API:** the gateway allows unauthenticated **`GET /v1/inventory/chains`**, search, hotels, availability, and **`POST /v1/reservations`** when the client sends **`x-chain-code: HBR`** (resolved to `x-chain-id` upstream). The gateway worker needs **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** for chain-code lookup (same optional secrets as **`/health/ready`**).

### Deploy web (Cloudflare Pages)

On **`main`**, CI runs the **`deploy-web`** job when **`VITE_AUTH0_CLIENT_ID`** (and related secrets) are set in GitHub Actions. It builds **`apps/web`** with production **`VITE_*`** values and publishes to the **`hospitality-web`** Pages project.

**One-time setup:**

1. Add GitHub secrets **`VITE_AUTH0_DOMAIN`**, **`VITE_AUTH0_CLIENT_ID`**, **`VITE_AUTH0_AUDIENCE`** (same values as local `.env`; **`GATEWAY_BASE_URL`** is reused for the gateway).
2. Ensure **`CLOUDFLARE_API_TOKEN`** includes **Cloudflare Pages: Edit** (update the token if Workers deploy already works but Pages fails).
3. Push to **`main`** or **Run workflow** — first run creates the Pages project if needed.
4. In Auth0, add the live **`*.pages.dev`** URL to callback, logout, and web origins (see step 1 above).

**Manual deploy** (same build + Wrangler as CI):

```bash
export VITE_GATEWAY_URL="https://your-gateway.workers.dev"
export VITE_AUTH0_DOMAIN="dev-xxxxx.us.auth0.com"
export VITE_AUTH0_CLIENT_ID="your_spa_client_id"
export VITE_AUTH0_AUDIENCE="https://hospitality-api"
npm run deploy:web
```

## Smoke test (gateway URL)

Set `GATEWAY_URL` to your deployed gateway (e.g. `https://hospitality-gateway.<subdomain>.workers.dev`). Set `ACCESS_TOKEN` to an Auth0 access token whose `aud` matches `AUTH0_AUDIENCE` and that includes claim **`https://hospitality.app/claims/chain_id`** (demo seed value: `00000000-0000-0000-0000-000000000001`). Use a new UUID for each first-time booking test; repeating the same `Idempotency-Key` replays the booking (**200** + `idempotent_replay: true`).

Replace `HOTEL_ID` and `ROOM_TYPE_ID` with UUIDs for your chain (from **Table Editor** → schema **`inventory`**, tables **`hotel`** / **`room_type`**, or copy `hotel.id` from `GET /v1/inventory/hotels` and pick a `room_type` row for that hotel).

```bash
curl -sS "$GATEWAY_URL/health"
curl -sS "$GATEWAY_URL/health/ready"
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" "$GATEWAY_URL/v1/inventory/hotels"
curl -sS -X POST "$GATEWAY_URL/v1/reservations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001" \
  -d "{\"hotel_id\":\"$HOTEL_ID\",\"room_type_id\":\"$ROOM_TYPE_ID\",\"check_in\":\"2026-06-01\",\"check_out\":\"2026-06-04\",\"guest\":{\"first_name\":\"Ada\",\"last_name\":\"Lovelace\",\"email\":\"ada@example.com\"}}"
curl -sS -H "Authorization: Bearer $ACCESS_TOKEN" "$GATEWAY_URL/v1/reservations/RESERVATION_ID"
```

PowerShell (same idea):

```powershell
$GATEWAY_URL = "https://hospitality-gateway.<subdomain>.workers.dev"
$ACCESS_TOKEN = "<paste_access_token>"
$HOTEL_ID = "<uuid>"
$ROOM_TYPE_ID = "<uuid>"
curl.exe -sS "$GATEWAY_URL/health"
curl.exe -sS -H "Authorization: Bearer $ACCESS_TOKEN" "$GATEWAY_URL/v1/inventory/hotels"
curl.exe -sS -X POST "$GATEWAY_URL/v1/reservations" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001" -d ('{"hotel_id":"'+$HOTEL_ID+'","room_type_id":"'+$ROOM_TYPE_ID+'","check_in":"2026-06-01","check_out":"2026-06-04","guest":{"first_name":"Ada","last_name":"Lovelace","email":"ada@example.com"}}')
```

## 4) Local dev

From the repo root (workspaces):

```bash
npm install
```

Copy `.dev.vars.example` → `.dev.vars` in each `services/*` and fill values.

Run one Worker at a time (each uses its own port):

```bash
npm run dev:inventory
npm run dev:reservations   # other terminal
npm run dev:gateway        # other terminal; needs bindings to the other two
```

**Service bindings:** `wrangler dev` resolves `INVENTORY` / `RESERVATIONS` when those Workers exist in your Cloudflare account. Easiest path: **deploy** inventory + reservations once, then run only the gateway locally with bindings, or run all three against production bindings per [Wrangler docs](https://developers.cloudflare.com/workers/development-testing/).

**Routed paths (through gateway):**

- `GET /health` — no auth.
- **`GET /health/ready`** — JWKS + optional Supabase ping; gateway logs JSON `{ request_id, method, path, status, duration_ms }` per request (**7D**).
- `GET /openapi.json`, `GET /docs` — no auth; public API contract.
- `GET /v1/inventory/hotels` — Bearer + claim `https://hospitality.app/claims/chain_id`.
- `GET /v1/inventory/hotels/:id` — same; one hotel for that chain (**404** if wrong id/chain).
- `GET /v1/inventory/hotels/:hotelId/room-types` — same; **`room_types[]`** include **`units_total`**, **`overbooking_allowance`**, **`base_rate_cents`**, **`currency`**, **`tax_rate_bps`**, **`fee_fixed_cents`** after **`0012`** (**404** if hotel not in chain).
- `GET /v1/inventory/hotels/:hotelId/room-types/:roomTypeId/availability?check_in=&check_out=` — per-**night** **bookable** + **pricing**; optional **`rate_plan_code`** / **`promotion_code`**.
- `GET /v1/inventory/search` — multi-hotel/room search (**0014**+).
- `GET /v1/inventory/hotels/:hotelId/room-types/:roomTypeId/calendar?from=&to=` — per-day calendar (**0014**+).
- `POST …/soft-holds`, `DELETE /v1/inventory/soft-holds/:holdId` — TTL soft holds (**0015**).
- `GET /v1/reservations` — list with optional **`status`**, **`hotel_id`**, **`stay_from`**/**`stay_to`** filters (**0013**+).
- `POST /v1/reservations` — same auth + `Idempotency-Key` + JSON body; optional **`expected_total_cents`** for quote parity.
- `GET /v1/reservations/:id` — reservation + **`guest`**; response **`ETag`** from **`row_version`** (**0015**).
- `PATCH /v1/reservations/:id` — **`status`** lifecycle; optional **`cancellation_reason`** when cancelling; optional **`If-Match`** → **412** (**0015**/**0016**).
- `PATCH /v1/reservations/:id/guest` — partial guest fields; optional **`If-Match`**.
- `PATCH /v1/reservations/:id/notes` — **`internal_note`**, **`guest_note`** (**0016**); optional **`If-Match`**.

## Conventions (from architecture plan)

- Multi-chain: reservation rows stay **`chain_id`**-scoped; enterprise users carry **`enterprise_id`** on the JWT. Gateway loads brand UUIDs from inventory, applies staff grants from **`inventory.staff_member`**, and forwards **`x-chain-ids`**. Active brand from **`x-chain-code`** (SPA brand path). **`GET /v1/inventory/me/chains`** returns the caller’s allowed brands. List accepts optional **`chain_id`** query filter.
- Errors: **RFC 7807** `application/problem+json`.
- Bookings: **`Idempotency-Key`** on `POST /v1/reservations`; stays are **date-only** with `check_out` **after** `check_in`. Capacity is **per night**: each night in **[check_in, check_out)** may have at most **`units_total` + `overbooking_allowance`** overlapping **pending**/**confirmed** stays (**`0012`** replaces interval-only counting). **Commercial:** **`tax_rate_bps`** on room subtotal, **`fee_fixed_cents`** per stay (quote via **GET …/availability**). Reservation **status**: `pending`, `confirmed`, `cancelled` (**`0009`**).

## Next steps

- **Phase 8**: guest/staff SPA (Vite + React + Auth0). Phase **7** complete — see [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
