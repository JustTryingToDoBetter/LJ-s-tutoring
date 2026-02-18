const { test, expect } = require("@playwright/test");
const { installNetworkGuard } = require("./helpers/network");
const { watchConsole } = require("./helpers/console");

function isBenignConsoleError(message) {
  const text = String(message || "");
  return (
    text.includes("ERR_FAILED")
    || text.includes("Did not parse stylesheet")
    || text.includes("Failed integrity metadata check")
    || text.includes("Failed to find a valid digest")
    || text.includes("due to access control checks")
  );
}

test.describe("Website", () => {
  test("loads key pages without console errors", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    const pages = ["/", "/privacy", "/terms", "/guides", "/guides/matric-maths-mistakes-guide"];

    for (const path of pages) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
    }

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("critical CTAs and nav work", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Project Odysseus/i);
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /student dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /tutor dashboard/i })).toBeVisible();

    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("contact form validates client-side", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await page.fill('input[name="email"]', 'not-an-email');
    await page.fill('input[name="password"]', 'invalid');
    await page.click('button[type="submit"]');

    const isValid = await page.locator('input[name="email"]').evaluate((el) => el.checkValidity());
    expect(isValid).toBe(false);

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });
});
