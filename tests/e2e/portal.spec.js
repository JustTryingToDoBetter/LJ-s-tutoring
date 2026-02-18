const { test, expect } = require("@playwright/test");
const { installNetworkGuard } = require("./helpers/network");
const { watchConsole } = require("./helpers/console");
const { loginAs } = require("./helpers/auth");

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

test.describe("LMS portals", () => {
  test("admin dashboard loads", async ({ page, context, request }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await loginAs(request, context, "ADMIN", "admin-ui@test.local");

    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
    await expect(page.locator('text=Tutors:')).toBeVisible();
    await expect(page.locator('text=Students:')).toBeVisible();

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("tutor home loads", async ({ page, context, request }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await loginAs(request, context, "TUTOR", "tutor-ui@test.local");

    await page.goto("/tutor/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole('heading', { name: /tutor operations/i })).toBeVisible();
    await expect(page.locator('text=Today sessions:')).toBeVisible();

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("student dashboard loads", async ({ page, context, request }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await loginAs(request, context, "STUDENT", "student-ui@test.local");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole('heading', { name: /recommended next/i })).toBeVisible();
    await expect(page.locator('text=Minutes:')).toBeVisible();

    const jsErrors = consoleWatch.errors.filter((err) => !isBenignConsoleError(err.message));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test('login page + role dashboards smoke', async ({ page, context, request }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

    await loginAs(request, context, 'STUDENT', `student-ui-smoke-${Date.now()}@test.local`);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Minutes:')).toBeVisible();

    await loginAs(request, context, 'ADMIN', `admin-ui-smoke-${Date.now()}@test.local`);
    await page.goto('/tutor/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Today sessions:')).toBeVisible();
  });
});
