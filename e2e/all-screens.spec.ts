import { test, expect } from "@playwright/test";

const enterprise = process.env.ENTERPRISE_CODE ?? "PLG";

/** Routes that should render without crashing (no Auth0 login required). */
const PUBLIC_ROUTES = [
  { path: "/", title: /where would you like to stay|book a stay/i },
  { path: "/platform", title: /platform portal|platform access|enterprises|checking access/i },
  { path: `/e/${enterprise}`, title: new RegExp(enterprise, "i") },
  { path: "/c/DEMO", title: /find your stay/i },
  { path: "/invite/accept", title: /accept staff invite/i },
  { path: `/e/${enterprise}/admin`, title: /enterprise admin|checking access|manager access|sign in/i },
  { path: `/e/${enterprise}/admin/brands`, title: /brands|checking access|manager access|sign in/i },
  { path: `/e/${enterprise}/admin/properties`, title: /properties|checking access|manager access|sign in/i },
  { path: `/e/${enterprise}/admin/rates`, title: /rates|checking access|manager access|sign in/i },
  { path: `/e/${enterprise}/admin/availability`, title: /availability|checking access|manager access|sign in/i },
];

test.describe("All screens smoke (no login)", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} renders without error boundary`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => {
        consoleErrors.push(err.message);
      });

      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(500);

      await expect(page.getByText("Something went wrong")).not.toBeVisible();
      await expect(page.locator("#root")).not.toBeEmpty();

      // App should show meaningful content (heading or main landmark)
      const heading = page.getByRole("heading").first();
      await expect(heading).toBeVisible({ timeout: 20_000 });

      const fatal = consoleErrors.filter(
        (e) =>
          !e.includes("Auth0") &&
          !e.includes("Failed to fetch") &&
          !e.includes("401") &&
          !e.includes("403") &&
          !e.includes("NetworkError") &&
          !e.includes("CORS")
      );
      expect(fatal, `Console errors on ${route.path}: ${fatal.join("; ")}`).toEqual([]);
    });
  }

  test("home → enterprise hub → chain booking navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /where would you like/i })).toBeVisible();

    const enterpriseLink = page.getByRole("link", { name: /enterprise hub/i }).first();
    if (await enterpriseLink.isVisible()) {
      await enterpriseLink.click();
      await expect(page).toHaveURL(new RegExp(`/e/${enterprise}`));
    } else {
      await page.goto(`/e/${enterprise}`);
    }

    const brandLink = page.getByRole("link", { name: /book a stay|view availability/i }).first();
    await expect(brandLink).toBeVisible({ timeout: 15_000 });
    await brandLink.click();
    await expect(page).toHaveURL(/\/c\//);
    await expect(page.getByRole("heading", { name: /find your stay/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^search$/i })).toBeVisible();
  });

  test("chain booking search form submits", async ({ page }) => {
    await page.goto("/c/DEMO");
    await expect(page.getByRole("heading", { name: /find your stay/i }).first()).toBeVisible();

    const searchBtn = page.getByRole("button", { name: /^search$/i });
    await searchBtn.click();

    await expect(
      page.getByText(/no rooms available|select|night|searching|price on request|available/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });
});
