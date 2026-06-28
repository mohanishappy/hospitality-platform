import { test, expect } from "@playwright/test";

const enterprise = process.env.ENTERPRISE_CODE ?? "PLG";
const email = process.env.E2E_MANAGER_EMAIL;
const password = process.env.E2E_MANAGER_PASSWORD;

async function loginAsManager(page: import("@playwright/test").Page) {
  await page.goto(`/e/${enterprise}/admin`);
  const signIn = page.getByRole("button", { name: "Sign in" }).first();
  if (await signIn.isVisible()) {
    await signIn.click();
    await page.getByRole("textbox", { name: /email/i }).fill(email!);
    await page.getByRole("textbox", { name: /password/i }).fill(password!);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL((url) => !url.hostname.includes("auth0.com"), {
      timeout: 90_000,
    });
    await page.waitForTimeout(2000);
    await page.goto(`/e/${enterprise}/admin`, { waitUntil: "networkidle" });
  }
  await page
    .getByText(/Checking access/i)
    .waitFor({ state: "hidden", timeout: 45_000 })
    .catch(() => undefined);
  await expect(page.getByText(/Manager access required/i)).not.toBeVisible({
    timeout: 15_000,
  });
}

/** Deep-link to admin tab (reliable vs in-app nav until SPA routing fix is deployed). */
async function openAdminTab(
  page: import("@playwright/test").Page,
  tab: "staff" | "brands" | "properties" | "rates" | "availability"
) {
  const path =
    tab === "staff"
      ? `/e/${enterprise}/admin`
      : `/e/${enterprise}/admin/${tab}`;
  await page.goto(path, { waitUntil: "networkidle" });
  await page
    .getByText(/Checking access/i)
    .waitFor({ state: "hidden", timeout: 45_000 })
    .catch(() => undefined);
}

test.describe("Enterprise admin portal", () => {
  test.skip(
    !email || !password,
    "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD in .env.e2e"
  );

  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("staff tab loads", async ({ page }) => {
    await openAdminTab(page, "staff");
    await expect(
      page.getByRole("heading", { name: /invite staff|team/i }).first()
    ).toBeVisible();
  });

  test("brands tab — list and create form", async ({ page }) => {
    await openAdminTab(page, "brands");
    await expect(
      page.getByRole("heading", { name: "Brands", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create brand/i })
    ).toBeVisible();
  });

  test("properties tab — brand picker", async ({ page }) => {
    await openAdminTab(page, "properties");
    await expect(
      page.getByRole("heading", { name: "Properties" })
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Brand" })).toBeVisible();
  });

  test("rates tab — plans and promotions sub-nav", async ({ page }) => {
    await openAdminTab(page, "rates");
    await expect(
      page.getByRole("heading", { name: /rates & promotions/i })
    ).toBeVisible();
    await page.getByRole("button", { name: "Promotions" }).click();
    await expect(
      page.getByRole("heading", { name: "Promotions", exact: true })
    ).toBeVisible();
  });

  test("availability tab — block form", async ({ page }) => {
    await openAdminTab(page, "availability");
    await expect(
      page.getByRole("heading", { name: "Availability" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Inventory blocks" })
    ).toBeVisible();
  });
});
