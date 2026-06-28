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
| **`access_token`** | Environment | Auth0 **access token** whose `aud` is your API identifier and that includes claim **`https://hospitality.app/claims/enterprise_id`** (PLG demo: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`). Staff also need a matching **`inventory.staff_member`** row keyed by JWT **`sub`**. Legacy tokens with **`chain_id`** only still work. |
| **`check_in` / `check_out`** | Environment | `YYYY-MM-DD`; **`check_out`** must be **after** **`check_in`** |
| **`hotel_id`** | Collection (default) | Filled by **GET List hotels** on success; or set manually on the collection. Optional: add to environment with a **real** UUID only — never `""`. |
| **`room_type_id`** | Collection (default) | Filled by **GET Room types**; or set manually. Same rule as `hotel_id`. |
| **`reservation_id`** | Collection (default) | Filled by **POST Create reservation** on success. |
| **`idempotency_key`** | Collection / env | Pre-request generates a GUID when the resolved value is blank (writes **collection** and **active environment**). Clear for a **new** booking; keep for replay (**200**). |
| **`rate_plan_code`** / **`promotion_code`** | Collection (optional) | Empty by default. Set to match **GET …/availability** when testing **0014** pricing (e.g. DEMO **LOS3** with 3+ nights, **SAVE5**). |
| **`search_hotel_ids`** | Collection (optional) | Comma-separated hotel UUIDs for **GET Search stays**; leave blank to search the whole chain. |
| **`calendar_from`** / **`calendar_to`** | Collection | Half-open **`[from, to)`** for **GET Room type calendar** (defaults: one month in the collection). |
| **`chain_code`** | Collection (optional) | Active brand code (e.g. **`HBR`**). Collection pre-request sends **`x-chain-code`** when non-empty. Clear for enterprise-wide admin calls. |
| **`enterprise_code`** | Collection (optional) | Enterprise catalog code for public routes (default **`PLG`**). |
| **`chain_id`** | Collection (optional) | Brand UUID; optional filter on **GET List reservations**. **GET My chains** may set the first id. |
| **`staff_member_id`** | Collection (optional) | Set by **POST Create staff member** for admin PATCH/PUT. |

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
2. **GET List enterprises** / **GET Enterprise chains** — public catalog (no token).
3. **GET My chains** (authenticated) — brands you may access; may set **`chain_id`**.
4. **GET List hotels** — copy one hotel **`id`** → **`hotel_id`**. Pick a **`room_type`** with that **`hotel_id`** → **`room_type_id`**.
5. **GET Room type availability & quote** — optional **`rate_plan_code`** / **`promotion_code`** on the collection.
6. **GET Search stays** / **GET Room type calendar** — after **0014**; calendar uses **`calendar_from`** / **`calendar_to`**.
7. **POST Create reservation** — should return **201** (or **200** on replay). **`reservation_id`** is saved to the active environment when possible.
8. **GET Reservation by id** — uses **`{{reservation_id}}`**; saves **`reservation_etag`**.
9. **PATCH Guest contact** → **PATCH Reservation notes** → **PATCH Confirm** → **PATCH Cancel** (optional **`cancellation_reason`** on collection; **0016**+).

**Admin staff (manager):** **GET List staff** → **POST Create staff member** → **PATCH** / **PUT …/chains** as needed. See **`docs/AUTHORIZATION.md`**.

**Roles (optional):** if your Auth0 Action adds **`https://hospitality.app/claims/roles`**, use **`manager`** for cancel, **`internal_note`**, and staff admin; **`front_desk`** for confirm/guest/notes (guest only). Tokens **without** a roles claim behave as today (full access for M2M; guest for SPA users).

---

## Import (quick reference)

1. Postman → **Import** → `hospitality-platform.postman_collection.json`.
2. Import your **local** environment file (from step 2 above) or the **example** file for a blank template.
3. Select the environment, then set **`baseUrl`** and **`access_token`** at minimum.

---

## Requests (gateway only)

- **GET** `/health` — no auth.
- **GET** `/v1/inventory/enterprises` — no auth; enterprise catalog (**0017**).
- **GET** `/v1/inventory/enterprises/:code` — no auth; e.g. `{{enterprise_code}}`.
- **GET** `/v1/inventory/enterprises/:code/chains` — no auth; brands under an enterprise.
- **GET** `/v1/inventory/chains` — no auth; all brands.
- **GET** `/v1/inventory/chains/:code` — no auth; e.g. `{{chain_code}}`.
- **GET** `/v1/inventory/me/chains` — Bearer; caller's allowed brands (**0018**).
- **GET** `/v1/inventory/admin/staff` — Bearer + **manager**; list staff.
- **POST** `/v1/inventory/admin/staff` — Bearer + **manager**; provision staff (legacy manual `auth0_sub`).
- **POST** `/v1/inventory/admin/staff/invite` — Bearer + **manager**; pending staff + copy-link accept URL (**9B**).
- **POST** `/v1/inventory/invites/accept` — Bearer (invited user); link account to pending staff (**9B**).
- **PATCH** `/v1/inventory/admin/staff/:id` — Bearer + **manager**; update staff fields.
- **PUT** `/v1/inventory/admin/staff/:id/chains` — Bearer + **manager**; replace brand grants.
- **GET** `/v1/inventory/admin/chains/:chainId/hotels` — Bearer + **manager**; list hotels for a brand (**10C**).
- **POST** `/v1/inventory/admin/chains/:chainId/hotels` — Bearer + **manager**; create hotel (**10C**).
- **GET** `/v1/inventory/admin/hotels/:hotelId` — Bearer + **manager**; hotel detail + booking policies (**10C**).
- **PATCH** `/v1/inventory/admin/hotels/:hotelId` — Bearer + **manager**; update hotel / policies (**10C**).
- **GET** `/v1/inventory/admin/hotels/:hotelId/room-types` — Bearer + **manager**; room types with BAR (**10C**).
- **POST** `/v1/inventory/admin/hotels/:hotelId/room-types` — Bearer + **manager**; create room type (**10C**).
- **PATCH** `/v1/inventory/admin/room-types/:roomTypeId` — Bearer + **manager**; update room type (**10C**).
- **GET** `/v1/inventory/hotels` — Bearer token (optional **`x-chain-code`** via **`chain_code`** var); tests may set `hotel_id` from first row.
- **GET** `/v1/inventory/hotels/:id` — Bearer; e.g. `{{hotel_id}}`.
- **GET** `/v1/inventory/hotels/:hotelId/room-types` — Bearer; e.g. `{{hotel_id}}` (tests may set `room_type_id`).
- **GET** `/v1/inventory/hotels/:hotelId/room-types/:roomTypeId/availability?check_in=&check_out=` — Bearer; quote + per-night bookability; optional `rate_plan_code`, `promotion_code` (uses `{{hotel_id}}`, `{{room_type_id}}`, `{{check_in}}`, `{{check_out}}`).
- **GET** `/v1/inventory/search?check_in=&check_out=` — Bearer; optional `hotel_ids`, `sort`, `limit`, `rate_plan_code`, `promotion_code`.
- **GET** `/v1/inventory/hotels/:hotelId/room-types/:roomTypeId/calendar?from=&to=` — Bearer; per-day occupancy / blocks (half-open range).
- **GET** `/v1/reservations` — Bearer; optional `limit` / `offset` / `chain_id` / `status` / `hotel_id` query params.
- **POST** `/v1/reservations` — Bearer + `Idempotency-Key` + JSON body (see request description).
- **GET** `/v1/reservations/:id` — Bearer; uses `{{reservation_id}}`.
- **PATCH** `/v1/reservations/:id` — Bearer; JSON `{ "status": "confirmed" | "cancelled" }`; optional **`cancellation_reason`** when cancelling (see **Cancel**).
- **PATCH** `/v1/reservations/:id/notes` — Bearer; `{ "internal_note"?, "guest_note"? }` (at least one field).
- **PATCH** `/v1/reservations/:id/guest` — partial contact fields; see **PATCH Guest contact**.

---

## Guest promo flow (Phase 10A)

End-to-end on brand **DEMO** without staff login (public booking):

1. In **00 — Public**, run **GET Search stays (public + SAVE5)** — header **`x-chain-code: DEMO`**, query **`promotion_code=SAVE5`**. Expect **`pricing.discount_cents`** on hits when the promo applies.
2. Run the same dates **without** `promotion_code` ( **GET Search stays** in **01 — Inventory** with **`chain_code=DEMO`**, or clear promo in URL) and compare **`total_cents`**.
3. For **LOS3**, use **GET Search stays (public + LOS3)** with **3+ nights** (`check_in` / `check_out` on the collection).
4. Pick a hit: copy **`pricing.rate_plan_code`** into **`rate_plan_code`**, run **GET Room type availability & quote**, then **POST Create reservation** with matching **`rate_plan_code`** / **`promotion_code`** and **`expected_total_cents`** from the quote.

SPA equivalent: open **`/c/DEMO`**, enter promo on the search form, complete book flow.

Requires migrations **0014** (rate plans / promotions) and **0020** (BAR seed on all demo room types).

---

## Admin catalog (Phase 10C)

Folder **01c — Admin catalog** — manager token, **`staff:admin`**. Set **`admin_chain_id`** (DEMO default: `00000000-0000-0000-0000-000000000001`) or run **GET My chains** first. Clear **`chain_code`** when calling enterprise-wide admin routes.

Typical flow: **POST Create brand** → **GET List hotels (admin)** → **POST Create hotel** → **POST Create room type** → **POST Create rate plan** + **PUT LOS tiers** / **POST Create promotion** → **POST Create block** → verify in **GET Search stays** on that brand (after ~60s gateway cache).

Rates and blocks are also manageable in the Enterprise Admin Portal at **`/e/:code/admin/rates`** and **`/e/:code/admin/availability`**.

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
