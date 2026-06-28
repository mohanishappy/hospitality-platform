#!/usr/bin/env node
/**
 * Fetch an Auth0 access token via Resource Owner Password grant (e2e / smoke only).
 *
 * Requires Auth0 Application → Settings → Advanced → Grant Types → Password enabled,
 * and a Database connection allowed for the app.
 *
 * Env (or pass via .env.e2e):
 *   AUTH0_DOMAIN
 *   AUTH0_CLIENT_ID
 *   AUTH0_CLIENT_SECRET   — optional; required if app is confidential
 *   AUTH0_AUDIENCE
 *   E2E_MANAGER_EMAIL
 *   E2E_MANAGER_PASSWORD
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(resolve(root, ".env.e2e"));
loadDotEnv(resolve(root, "apps/web/.env"));

const domain = process.env.AUTH0_DOMAIN ?? process.env.VITE_AUTH0_DOMAIN;
const clientId =
  process.env.AUTH0_CLIENT_ID ?? process.env.VITE_AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET?.trim();
const audience =
  process.env.AUTH0_AUDIENCE ?? process.env.VITE_AUTH0_AUDIENCE;
const username = process.env.E2E_MANAGER_EMAIL?.trim();
const password = process.env.E2E_MANAGER_PASSWORD;

if (!domain || !clientId || !audience || !username || !password) {
  console.error(
    "Need AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_AUDIENCE, E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD"
  );
  console.error("Copy .env.e2e.example → .env.e2e and fill in values.");
  process.exit(1);
}

const body = {
  grant_type: "password",
  username,
  password,
  client_id: clientId,
  audience,
  scope: "openid profile email",
};
if (clientSecret) body.client_secret = clientSecret;

const res = await fetch(`https://${domain}/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30_000),
});

const json = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Auth0 token error:", res.status, json);
  process.exit(1);
}

if (process.argv.includes("--export")) {
  process.stdout.write(json.access_token ?? "");
} else {
  console.log(json.access_token ?? "");
}
