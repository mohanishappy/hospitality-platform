# Postman — Hospitality Platform

## Recommended layout

| Artifact | Role |
|----------|------|
| **Collection** (`*.postman_collection.json`) | Folders per API area, request definitions, **collection variables** with safe defaults, optional **test** scripts. |
| **Environment** (`*.postman_environment.json`) | **Secrets** (`access_token`), **per-developer URLs**, and UUIDs you are testing (`hotel_id`, `room_type_id`). Never commit real tokens. |

Use **Collection** for structure and shared behavior; use **Environment** for values that change per person or per deploy. Select the environment in Postman’s top-right dropdown so `{{baseUrl}}` and `{{access_token}}` resolve correctly.

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

| Variable | What to put |
|----------|-------------|
| **`baseUrl`** | Gateway root only, no trailing slash, e.g. `https://hospitality-gateway.your-subdomain.workers.dev` |
| **`access_token`** | Auth0 **access token** whose `aud` is your API identifier and that includes claim **`https://hospitality.app/claims/chain_id`** (UUID matching `inventory.chain` for this tenant) |
| **`hotel_id`** | UUID of a hotel for that chain (from **GET List hotels** or Supabase **Table Editor** → `inventory.hotel`) |
| **`room_type_id`** | UUID of a **room_type** row for **that** hotel (`inventory.room_type`, same `hotel_id`) |
| **`check_in` / `check_out`** | `YYYY-MM-DD`; **`check_out`** must be **after** **`check_in`** |
| **`reservation_id`** | Leave empty until **POST Create reservation** runs; tests fill it |
| **`idempotency_key`** | Leave empty; pre-request generates a GUID. Clear to start a **new** booking; keep the same value to test replay (**200**) |

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
- **GET** `/v1/reservations` — Bearer; optional `limit` / `offset` query params.
- **POST** `/v1/reservations` — Bearer + `Idempotency-Key` + JSON body (see request description).
- **GET** `/v1/reservations/:id` — Bearer; uses `{{reservation_id}}`.
- **PATCH** `/v1/reservations/:id` — Bearer; JSON `{ "status": "confirmed" | "cancelled" | "pending" }` (see collection **Confirm** / **Cancel**).
- **PATCH** `/v1/reservations/:id/guest` — partial contact fields; see **PATCH Guest contact**.

---

## Idempotency in this collection

**POST Create reservation** pre-request:

- If **`idempotency_key`** is missing or blank in **environment** and collection, it sets a new **`{{$guid}}`** (and writes it to the **active environment** when one is selected, plus collection).
- If Postman resolves **`{{idempotency_key}}`** from the environment as an **empty** string, the script treats that as “unset” and generates a key (fixed in the collection scripts).

For a **new** booking: clear **`idempotency_key`** in your **environment**.  
For a **replay** test: do not clear it; send **POST** again with the same body → expect **200** and **`idempotent_replay: true`**.

---

## “Right way” checklist

- One **base URL** variable (`baseUrl`), no hard-coded hosts in every URL.
- **Bearer** only on folders that need it; **noauth** on public routes.
- **Tests** only for light assertions and saving ids — keep heavy logic in automated CI if you add it later.
- **Do not** paste production secrets into tracked JSON; use a **local** environment file (`*.local.postman_environment.json`) or Postman’s **secret** type for tokens.
- Re-import the collection after pulling repo changes if requests or scripts were updated.
