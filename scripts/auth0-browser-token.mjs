#!/usr/bin/env node
/**
 * Obtain manager access token by signing in through the SPA (no Password grant needed).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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

const webBase =
  process.env.WEB_BASE_URL?.replace(/\/+$/, "") ??
  "https://hospitality-web-bfc.pages.dev";
const enterprise = process.env.ENTERPRISE_CODE ?? "PLG";
const email = process.env.E2E_MANAGER_EMAIL?.trim();
const password = process.env.E2E_MANAGER_PASSWORD;

if (!email || !password) {
  console.error("Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD in .env.e2e");
  process.exit(1);
}

let capturedToken = "";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/oauth/token")) return;
  try {
    const json = await response.json();
    if (typeof json?.access_token === "string") {
      capturedToken = json.access_token;
    }
  } catch {
    /* ignore */
  }
});

page.on("request", (request) => {
  const auth = request.headers()["authorization"];
  if (auth?.startsWith("Bearer ") && auth.length > 30) {
    capturedToken = auth.slice(7);
  }
});

try {
  await page.goto(`${webBase}/e/${enterprise}/admin`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await page.waitForURL((url) => url.href.startsWith(webBase), {
    timeout: 90_000,
  });
  await page.waitForFunction(
    () =>
      Object.keys(localStorage).some((k) => k.includes("auth0spajs")),
    undefined,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(2000);

  await page.goto(`${webBase}/e/${enterprise}/admin`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  if (await page.getByText(/Manager access required/i).isVisible()) {
    console.error(
      "Login succeeded but token has no manager role. Check 9B Action + staff_member link."
    );
    process.exit(1);
  }

  await page
    .getByText(/Checking access/i)
    .waitFor({ state: "hidden", timeout: 45_000 })
    .catch(() => undefined);

  await page
    .getByRole("heading", { name: /staff|invite staff|team|brands/i })
    .first()
    .waitFor({ timeout: 45_000 });

  if (!capturedToken) {
    await page.waitForTimeout(3000);
  }

  if (!capturedToken) {
    capturedToken = await page.evaluate(() => {
      for (const store of [localStorage, sessionStorage]) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (!key?.includes("auth0spajs")) continue;
          try {
            const raw = store.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const access = parsed?.body?.access_token;
            if (typeof access === "string" && access.length > 20) return access;
          } catch {
            /* next */
          }
        }
      }
      return "";
    });
  }

  if (!capturedToken) {
    console.error("Signed in but could not capture access_token.");
    process.exit(1);
  }

  if (process.argv.includes("--export")) {
    process.stdout.write(capturedToken);
  } else {
    console.log(capturedToken);
  }
} finally {
  await browser.close();
}
