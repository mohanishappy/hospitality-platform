# Postman — Hospitality Platform

## Recommended layout

| Artifact | Role |
|----------|------|
| **Collection** (`*.postman_collection.json`) | Folders per API area, request definitions, **collection variables** for ids (`hotel_id`, `room_type_id`, `reservation_id`, `idempotency_key`) and defaults, plus **test** / pre-request scripts. |
| **Environment** (`*.postman_environment.json`) | **`baseUrl`**, **`access_token`** (secret), **`check_in`** / **`check_out`**. Do **not** add empty placeholders for `hotel_id` / `room_type_id` / `reservation_id` / `idempotency_key` — see below. Never commit real tokens. |

### Variable resolution (important)

Postman resolves the **same** `{{name}}` with **environment before collection**. An **empty string** in the environment still **wins** over a non-empty **collection** value. That used to break flows where tests wrote ids to the collection but the example environment also defined those keys as `""`.

The **example** environment only defines `baseUrl`, `access_token`, `check_in`, and `check_out`. After a successful **GET List hotels** / **GET Room types** / **POST Create reservation**, scripts write ids to **both** collection and the **active** environment (when one is selected) so URLs and headers stay in sync.

If you have an **older** `*.local.postman_environment.json` with empty `hotel_id` / `room_type_id` / etc., **delete those keys** in Postman (or re-copy the example file) so they do not shadow the collection.

Select the environment in Postman’s top-right dropdown so `{{baseUrl}}` and `{{access_token}}` resolve correctly.

Optional: add a **`x-request-id`** header (any string) on a request; the gateway echoes it on the response and forwards it to Workers for log correlation.

---

## Local environment setup

### 1. Import the collection

Postman → **Import** → **`hospitality-platform.postman_collection.json`**.

### 2. Create your **private** environment (do not commit secrets)

**Option A — copy the example file (good for git)**

From the repo root:

```powershell
Copy-Item postman/hospitality-platform.example.postman_environment.json postman/hospitality-platform.local.postman_environment.json
```

`postman/*.local.postman_environment.json` is listed in **`.gitignore`**, so your token stays off git.

Then Postman → **Import** → `hospitality-platform.local.postman_environment.json`.

**Option B — inside Postman**

Import `hospitality-platform.example.postman_environment.json`, then **⋯** on that environment → **Duplicate**, rename to `Hospitality — local (you)` and edit values there. Export duplicate to disk only if you want a backup; still avoid committing it with a real token.

### 3. Select the environment

Top-right environment dropdown → choose **`Hospitality — example (local)`** or your duplicated **`Hospitality — local** env. If nothing is selected, `{{baseUrl}}` will not resolve.

### 4. Fill variables (required before bookings)

| Variable | Where | What to put |
|----------|--------|-------------|
| **`baseUrl`** | Environment | Gateway root only, no trailing slash, e.g. `https://hospitality-gateway.your-subdomain.workers.dev` |
| **`access_token`** | Environment | Auth0 **access token** whose `aud` is your API identifier and that includes claim **`https://hospitality.app/claims/chain_id`** (UUID matching `inventory.chain` for this tenant) |
| **`check_in` / `check_out`** | Environment | `YYYY-MM-DD`; **`check_out`** must be **after** **`check_in`** |
| **`hotel_id`** | Collection (default) | Filled by **GET List hotels** on success; or set manually on the collection. Optional: add to environment with a **real** UUID only — never `""`. |
| **`room_type_id`** | Collection (default) | Filled by **GET Room types**; or set manually. Same rule as `hotel_id`. |
| **`reservation_id`** | Collection (default) | Filled by **POST Create reservation** on success. |
| **`idempotency_key`** | Collection / env | Pre-request generates a GUID when the resolved value is blank (writes **collection** and **active environment**). Clear for a **new** booking; keep for replay (**200**). |

### 5. Get an M2M access token (example)

Replace placeholders and run in a terminal:

```bash
curl -sS -X POST "https://YOUR_AUTH0_DOMAIN/oauth/token" \
  -H "content-type: application/json" \
  -d "{\"client_id\":\"YOUR_M2M_CLIENT_ID\",\"client_secret\":\"YOUR_M2M_CLIENT_SECRET\",\"audience\":\"YOUR_API_IDENTIFIER\",\"grant_type\":\"client_credentials\"}"
```

Copy **`access_token`** from the JSON into Postman **`access_token`**.

### 6. Run requests in order

1. **GET Health** — confirms `baseUrl`.
2. **GET List hotels** — copy one hotel **`id`** → **`hotel_id`**. In Supabase (or metadata you keep), pick a **`room_type`** with that **`hotel_id`** → **`room_type_id`**.
3. **POST Create reservation** — should return **201** (or **200** on replay). **`reservation_id`** is saved to the active environment when possible.
4. **GET Reservation by id** — uses **`{{reservation_id}}`**.

---

## Import (quick reference)

1. Postman → **Import** → `hospitality-platform.postman_collection.json`.
2. Import your **local** environment file (from step 2 above) or the **example** file for a blank template.
3. Select the environment, then set **`baseUrl`** and **`access_token`** at minimum.

---

## Requests (gateway only)

- **GET** `/health` — no auth.
- **GET** `/v1/inventory/hotels` — Bearer token (tests may set `hotel_id` from first row).
- **GET** `/v1/inventory/hotels/:id` — Bearer; e.g. `{{hotel_id}}`.
- **GET** `/v1/inventory/hotels/:hotelId/room-types` — Bearer; e.g. `{{hotel_id}}` (tests may set `room_type_id`).
- **GET** `/v1/inventory/hotels/:hotelId/room-types/:roomTypeId/availability?check_in=&check_out=` — Bearer; quote + per-night bookability (uses `{{hotel_id}}`, `{{room_type_id}}`, `{{check_in}}`, `{{check_out}}`).
- **GET** `/v1/reservations` — Bearer; optional `limit` / `offset` query params.
- **POST** `/v1/reservations` — Bearer + `Idempotency-Key` + JSON body (see request description).
- **GET** `/v1/reservations/:id` — Bearer; uses `{{reservation_id}}`.
- **PATCH** `/v1/reservations/:id` — Bearer; JSON `{ "status": "confirmed" | "cancelled" | "pending" }` (see collection **Confirm** / **Cancel**).
- **PATCH** `/v1/reservations/:id/guest` — partial contact fields; see **PATCH Guest contact**.

---

## Idempotency in this collection

**POST Create reservation** pre-request:

- Reads the **effective** value via **`pm.variables.get('idempotency_key')`** (same resolution order as `{{idempotency_key}}` in the header: environment overrides collection).
- If that value is blank after trim, it generates a new **`{{$guid}}`**, sets **`idempotency_key`** on the **collection**, and on the **active environment** when one is selected (so the header for that request is not stuck on an empty env value).

For a **new** booking: clear **`idempotency_key`** (environment and/or collection).  
For a **replay** test: do not clear it; send **POST** again with the same body → expect **200** and **`idempotent_replay: true`**.

---

## “Right way” checklist

- One **base URL** variable (`baseUrl`), no hard-coded hosts in every URL.
- **Bearer** only on folders that need it; **noauth** on public routes.
- **Tests** only for light assertions and saving ids — keep heavy logic in automated CI if you add it later.
- **Do not** paste production secrets into tracked JSON; use a **local** environment file (`*.local.postman_environment.json`) or Postman’s **secret** type for tokens.
- Re-import the collection after pulling repo changes if requests or scripts were updated.
