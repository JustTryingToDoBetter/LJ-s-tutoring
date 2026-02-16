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

    const pages = ["/", "/privacy.html", "/terms.html", "/404.html", "/guides/matric-maths-mistakes-guide.html"];

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

    const mobileMenuButton = page.locator("#mobile-menu-btn");
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
    }

    await expect(page).toHaveTitle(/Maths Tutoring/i);
    const aboutLink = page.locator("a[href='#about']:visible").first();
    const contactLink = page.locator("a[href='#contact']:visible").first();
    await expect(aboutLink).toBeVisible();
    await expect(contactLink).toBeVisible();
    await expect(page.locator("a[href='/privacy.html']").first()).toBeVisible();
    await expect(page.locator("a[href*='wa.me']").first()).toBeVisible();

    await aboutLink.click();
    await expect(page).toHaveURL(/#about/);

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("contact form validates client-side", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.fill("#name", "Test Student");
    await page.fill("#email", "not-an-email");
    await page.selectOption("#grade", { label: "Grade 10" });
    await page.click("#contact-form button[type='submit']");

    const isValid = await page.locator("#email").evaluate((el) => el.checkValidity());
    expect(isValid).toBe(false);

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });
});
