#!/usr/bin/env node
/**
 * Run admin API smoke + Playwright UI e2e using .env.e2e credentials.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");
const envPath = resolve(root, ".env.e2e");

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
    process.env[key] = val;
  }
}

loadDotEnv(envPath);
loadDotEnv(resolve(root, "apps/web/.env"));

if (!process.env.E2E_MANAGER_PASSWORD?.trim()) {
  console.error(
    "Set E2E_MANAGER_PASSWORD in .env.e2e (manager@plg.demo Auth0 password), then re-run."
  );
  process.exit(1);
}

function fetchToken() {
  let r = spawnSync("node", ["scripts/auth0-password-token.mjs", "--export"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (r.status === 0 && r.stdout?.trim()) return r.stdout.trim();

  console.log(
    "Password grant unavailable — signing in via browser to read SPA token…\n"
  );
  r = spawnSync("node", ["scripts/auth0-browser-token.mjs", "--export"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  if (r.status !== 0 || !r.stdout?.trim()) {
    console.error(
      "Failed to obtain access token. Check .env.e2e credentials and manager staff row."
    );
    if (r.stderr) console.error(r.stderr);
    process.exit(1);
  }
  return r.stdout.trim();
}

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const token = fetchToken();

async function gatewayReachable() {
  const base = (
    process.env.GATEWAY_BASE_URL ??
    process.env.VITE_GATEWAY_URL ??
    ""
  ).replace(/\/+$/, "");
  if (!base) return false;
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

if (await gatewayReachable()) {
  run("Admin API smoke", "node", ["scripts/smoke-admin-api.mjs"], {
    SMOKE_MANAGER_TOKEN: token,
  });
} else {
  console.warn(
    "\nWarning: GET /health failed from this machine (DNS or network). " +
      "If the URL is correct in .env.e2e, run `npm run smoke:admin` locally " +
      "after setting SMOKE_MANAGER_TOKEN, or check the worker in Cloudflare Dashboard.\n"
  );
}

run("Playwright admin UI", "npx", ["playwright", "test", "e2e/admin-portal.spec.ts"]);

console.log("\nAll admin tests passed.\n");
