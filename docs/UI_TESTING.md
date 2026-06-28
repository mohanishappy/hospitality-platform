# UI and admin testing

Automated checks so you do not need to click through every admin tab manually.

## What runs where

| Tool | What it covers | Auth needed |
|------|----------------|-------------|
| **`npm run smoke:admin`** | All manager admin **APIs** (brand, hotel, room, rates, promo, blocks, invite) | Manager Bearer token |
| **`npm run e2e:admin`** | **UI** smoke — login + each admin tab loads | Auth0 email + password in `.env.e2e` |
| **Cursor browser / manual** | Exploratory UI | Same login as e2e |

Vitest unit tests (`npm test`) do not hit Auth0 or the live gateway.

## One-time setup: manager test account

### Option A — existing `manager@plg.demo` (recommended)

1. In **Auth0 Dashboard**, ensure the user exists and has a known password (or reset it).
2. Confirm **`inventory.staff_member`** is linked (migration seed + your `auth0_sub`):

```sql
update inventory.staff_member
set auth0_sub = 'auth0|YOUR_SUB',
    status = 'active',
    intended_role = 'manager',
    active = true
where lower(email) = 'manager@plg.demo';
```

3. Confirm the **9B Post Login Action** is deployed (`INVENTORY_CLAIMS_URL` + `ACTION_CLAIMS_SECRET`).

### Option B — new user via invite

1. Sign in as an existing manager → **Staff** → invite a new email with role **manager** and **all brands**.
2. Open the accept URL in an incognito window, sign up / sign in with that email, accept the invite.
3. Sign out and sign in again so the JWT picks up DB-driven roles.

Use that email/password in `.env.e2e`.

## Configure secrets (gitignored)

```bash
cp .env.e2e.example .env.e2e
# Edit E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD, AUTH0_* 
```

For **Password grant** token fetch (`npm run auth0:token`), enable **Password** under Auth0 Application → Advanced → Grant Types (dev only). If disabled (recommended for SPAs), `npm run test:admin` signs in via the browser and reads the token from localStorage instead.

## Run admin API smoke (no browser)

```powershell
# PowerShell — token from password grant:
$env:SMOKE_MANAGER_TOKEN = node scripts/auth0-password-token.mjs --export
npm run smoke:admin
```

Or paste a token from DevTools → Network after signing in to the admin portal:

```powershell
$env:SMOKE_MANAGER_TOKEN = "<access_token>"
$env:GATEWAY_BASE_URL = "https://hospitality-gateway.mohanishhappy.workers.dev"
npm run smoke:admin
```

Success creates a uniquely suffixed test brand and exercises every admin route.

## Run UI e2e (Playwright)

```bash
npm install
npx playwright install chromium
npm run e2e:admin
```

Tests log in through Auth0 Universal Login and assert each tab renders.

## What agents can do in Cursor

- **Browser MCP**: open `/e/PLG/admin`, walk tabs **after you sign in** in that browser session, or after `.env.e2e` credentials work with Playwright.
- **API smoke**: full admin regression without UI once `SMOKE_MANAGER_TOKEN` is set.
- **Cannot** create Auth0 users without Dashboard access or your password — use invite + signup or reset password for `manager@plg.demo`.

## Gateway URL

`GATEWAY_BASE_URL` in `.env.e2e` should match the deployed worker (same as `VITE_GATEWAY_URL` / GitHub `GATEWAY_BASE_URL`). Verify in a browser:

```text
https://YOUR-GATEWAY.workers.dev/health
```

Expect `{"ok":true}`. If that works on your machine but `npm run smoke:admin` fails in CI or a remote agent, it is usually a DNS/network limitation in that environment—not a wrong URL in `.env.e2e`.

If `/health` fails everywhere, redeploy: `npm run deploy:gateway`.

## Gateway cache (admin writes)

The gateway caches enterprise chain lists and enterprise metadata for **~60 seconds** after lookup. After creating a brand or changing staff grants, staff may need to **sign out and sign in again** (or wait up to 60s) before `/me/chains` and brand-scoped admin APIs reflect the change. Platform ops creating a new enterprise with zero brands can use admin routes immediately (zero-brand bypass).

| Service | URL |
|---------|-----|
| Web | https://hospitality-web-bfc.pages.dev |
| Gateway | https://hospitality-gateway.mohanishhappy.workers.dev |
| Admin | `/e/PLG/admin` (+ `/brands`, `/properties`, `/rates`, `/availability`) |
