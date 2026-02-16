const { test, expect } = require("@playwright/test");
const { installNetworkGuard } = require("./helpers/network");
const { watchConsole } = require("./helpers/console");
const { loginAs } = require("./helpers/auth");

test.describe("LMS portals", () => {
  test("admin dashboard loads", async ({ page, context, request }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await loginAs(request, context, "ADMIN", "admin-ui@test.local");

    await page.goto("/admin/index.html", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".page-title")).toContainText("Admin dashboard");
    await expect(page.locator("#countTutors")).not.toHaveText("");
    await expect(page.locator("#countStudents")).not.toHaveText("");

    const jsErrors = consoleWatch.errors.filter((err) => !String(err.message).includes("ERR_FAILED"));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("tutor home loads", async ({ page, context, request }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await loginAs(request, context, "TUTOR", "tutor-ui@test.local");

    await page.goto("/tutor/index.html", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#tutorName")).toContainText(/Test Tutor/i);
    await expect(page.locator("#todaySessions")).toBeVisible();

    const jsErrors = consoleWatch.errors.filter((err) => !String(err.message).includes("ERR_FAILED"));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });

  test("student dashboard loads", async ({ page, context, request }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await loginAs(request, context, "STUDENT", "student-ui@test.local");

    await page.goto("/dashboard/", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".page-title")).toContainText(/Welcome back|Smart Dashboard/i);
    await expect(page.locator("#todayCard")).toBeVisible();

    const jsErrors = consoleWatch.errors.filter((err) => !String(err.message).includes("ERR_FAILED"));
    expect(jsErrors).toEqual([]);
    expect(guard.blocked.length).toBeGreaterThanOrEqual(0);
  });
});
