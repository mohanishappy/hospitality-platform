# hospitality-platform

Microservices on **Cloudflare Workers** with **Supabase Postgres** and **Auth0**. Optimized for **free tiers** and a fast first deploy.

## Layout

| Path | Role |
|------|------|
| `CODE_SCAFFOLD.md` | Legacy bundle reference (sources now live under `services/` and `supabase/`) |
| `services/gateway` | Validates Auth0 JWTs, forwards to workers via **service bindings** (same URL path) |
| `services/inventory` | Hotels + **room types** (list/detail under gateway) |
| `services/reservations` | **POST/PATCH/GET** reservations; list; **status** lifecycle; idempotent **201**/**200** on create |
| `supabase/migrations` | SQL: through **`0011` — room_type units/pricing + booking availability** |
| `postman/` | Postman **collection** + **example environment** for gateway requests ([`postman/README.md`](postman/README.md)) |

## Prerequisites

- Node.js 20+
- [Cloudflare account](https://dash.cloudflare.com/) (Workers Free plan)
- [Supabase](https://supabase.com/) project (Free plan)
- [Auth0](https://auth0.com/) tenant (Free tier — confirm current limits)

## 1) Supabase

1. Create a project.
2. Run migrations in order in the SQL editor (or `supabase db push`): [`0001_init.sql`](supabase/migrations/0001_init.sql) through [`0011_room_type_units_pricing_and_availability.sql`](supabase/migrations/0011_room_type_units_pricing_and_availability.sql) — see earlier numbered files for inventory/reservations/RPC history.
3. **Turn on the Data API** (REST / PostgREST): Dashboard → **Project Settings** → **Data API** — use **Enable** if the API is off. Your Workers call this layer; it must be on.
4. **Expose API schemas** (required for `supabase-js` `.schema(...)`): same **Data API** page (or **Project Settings → API** on older dashboards) → **Exposed schemas**. Include at least `public`, `inventory`, and `reservations` (comma-separated; keep existing entries like `public`). Save. Without this, hotels returns `Invalid schema: inventory`.  
   *Some UIs only show “Exposed schemas” after the Data API is enabled.*
5. If hotels still returns **500** after migrations + steps 3–4, confirm **`0003_service_role_grants.sql`** ran successfully, then wait a short time and retry (there is no universal “reload schema cache” control on every dashboard).
6. Copy **Project URL** and **service_role** key (Workers use server-side secrets only — never expose service_role in the browser).

## 2) Auth0

1. Create an **API** with identifier = your `AUTH0_AUDIENCE` (e.g. `https://hospitality-api`).
2. Create a **Single Page Application** (for the UI later) with allowed callbacks.
3. Add an **Action** (post-login / credentials) to put **`https://hospitality.app/claims/chain_id`** into the access token as a UUID string matching **`inventory.chain.id`** for that tenant. Demo seed: `00000000-0000-0000-0000-000000000001`. After [`0005_realistic_catalog_seed.sql`](supabase/migrations/0005_realistic_catalog_seed.sql), additional chains use fixed ids in that file (e.g. Harborline `a1111111-1111-4111-8111-111111111111`) — use a separate M2M client or metadata-driven Action if you need multiple tenants in Auth0.

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

## Postman

Import **`postman/hospitality-platform.postman_collection.json`**, create a **local** env (copy the example to `postman/hospitality-platform.local.postman_environment.json` — gitignored — see [**Local environment setup**](postman/README.md#local-environment-setup)), then set `baseUrl`, `access_token`, `hotel_id`, and `room_type_id`. Full guide: [`postman/README.md`](postman/README.md).

## Smoke test (gateway URL)

Set `GATEWAY_URL` to your deployed gateway (e.g. `https://hospitality-gateway.<subdomain>.workers.dev`). Set `ACCESS_TOKEN` to an Auth0 access token whose `aud` matches `AUTH0_AUDIENCE` and that includes claim **`https://hospitality.app/claims/chain_id`** (demo seed value: `00000000-0000-0000-0000-000000000001`). Use a new UUID for each first-time booking test; repeating the same `Idempotency-Key` replays the booking (**200** + `idempotent_replay: true`).

Replace `HOTEL_ID` and `ROOM_TYPE_ID` with UUIDs for your chain (from **Table Editor** → schema **`inventory`**, tables **`hotel`** / **`room_type`**, or copy `hotel.id` from `GET /v1/inventory/hotels` and pick a `room_type` row for that hotel).

```bash
curl -sS "$GATEWAY_URL/health"
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
- `GET /v1/inventory/hotels` — Bearer + claim `https://hospitality.app/claims/chain_id`.
- `GET /v1/inventory/hotels/:id` — same; one hotel for that chain (**404** if wrong id/chain).
- `GET /v1/inventory/hotels/:hotelId/room-types` — same; **`room_types[]`** include **`units_total`** (parallel inventory), **`base_rate_cents`**, **`currency`** after **`0011`** (**404** if hotel not in chain).
- `GET /v1/reservations` — same auth; paginated list for the token’s **`chain_id`** (`?limit` default 20 max 100, `?offset` default **0**); body omits **`guest`** (use **GET …/:id**).
- `POST /v1/reservations` — same auth + `Idempotency-Key` + JSON body (`hotel_id`, `room_type_id`, `check_in` / `check_out` as **YYYY-MM-DD**, nested `guest`).
- `GET /v1/reservations/:id` — same auth; returns reservation + nested **`guest`** for that `chain_id`.
- `PATCH /v1/reservations/:id` — same auth; JSON `{"status":"confirmed"|"cancelled"|"pending"}` (**lifecycle**: `pending`→`confirmed`|`cancelled`; `confirmed`→`cancelled`; same status **no-op**; **409** on invalid change). Responses include **`updated_at`** after **`0009`**.
- `PATCH /v1/reservations/:id/guest` — same auth; partial JSON with at least one of **`first_name`**, **`last_name`**, **`email`**, **`phone`** (use **`phone`: `null`** to clear). Bumps **`guest.updated_at`** and **`reservation.updated_at`** (requires **`0010`**).

## Conventions (from architecture plan)

- Multi-chain: all tenant rows include `chain_id`; gateway enforces token `chain_id` vs path/body.
- Errors: **RFC 7807** `application/problem+json`.
- Bookings: **`Idempotency-Key`** on `POST /v1/reservations`; stays are **date-only** with `check_out` **after** `check_in`. Intervals are treated as **[check_in, check_out)** (half-open) for **overlap** with **`room_type.units_total`** (`pending` + `confirmed` count; **`0011`**). Reservation **status**: `pending`, `confirmed`, `cancelled` (**`0009`**).

## Next steps

- Per-night or **deduped** availability, overbooking rules, **taxes/fees** on `base_rate_cents`.
- Lightweight **UI** (Vite + React) with Auth0 SPA + gateway calls.
