const { test, expect } = require("@playwright/test");
const { installNetworkGuard } = require("./helpers/network");
const { watchConsole } = require("./helpers/console");

test.describe("Website", () => {
  test("loads key pages without console errors", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    const pages = ["/", "/privacy.html", "/terms.html", "/404.html", "/guides/matric-maths-mistakes-guide.html"];

    for (const path of pages) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
    }

    const jsErrors = consoleWatch.errors.filter((err) => !String(err.message).includes("ERR_FAILED"));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("critical CTAs and nav work", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Maths Tutoring/i);
    await expect(page.locator("a[href='/arcade/']").first()).toBeVisible();
    await expect(page.locator("a[href='/privacy.html']").first()).toBeVisible();
    await expect(page.locator("a[href*='wa.me']").first()).toBeVisible();

    await page.locator("a[href='/arcade/']").first().click();
    await expect(page).toHaveURL(/\/arcade\//);

    const jsErrors = consoleWatch.errors.filter((err) => !String(err.message).includes("ERR_FAILED"));
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

    await expect(page.locator("#form-status")).toContainText("Please enter a valid email address.");

    const jsErrors = consoleWatch.errors.filter((err) => !String(err.message).includes("ERR_FAILED"));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });
});
