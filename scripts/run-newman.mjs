#!/usr/bin/env node
/**
 * Run Postman collection via Newman (Phase 7G).
 * Env: GATEWAY_BASE_URL, SMOKE_ACCESS_TOKEN (required)
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = process.env.GATEWAY_BASE_URL?.replace(/\/+$/, "");
const token = process.env.SMOKE_ACCESS_TOKEN?.trim();

if (!base) {
  console.error("Missing GATEWAY_BASE_URL");
  process.exit(1);
}
if (!token) {
  console.error("Missing SMOKE_ACCESS_TOKEN");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collection = path.join(
  root,
  "postman/hospitality-platform.postman_collection.json"
);

const checkIn = process.env.CHECK_IN?.trim() || "2026-09-01";
const checkOut = process.env.CHECK_OUT?.trim() || "2026-09-04";

const args = [
  "run",
  collection,
  "--env-var",
  `baseUrl=${base}`,
  "--env-var",
  `access_token=${token}`,
  "--env-var",
  `check_in=${checkIn}`,
  "--env-var",
  `check_out=${checkOut}`,
  "--bail",
];

const result = spawnSync("npx", ["newman", ...args], {
  stdio: "inherit",
  shell: true,
  cwd: root,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\nNewman collection passed");
