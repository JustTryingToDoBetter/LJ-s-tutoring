const { test, expect } = require("@playwright/test");
const { installNetworkGuard } = require("./helpers/network");
const { watchConsole } = require("./helpers/console");

function surfaceSelector() {
  return "canvas, .po-sd-board, .po-game-frame, .po-sn-canvas, .po-pg-canvas";
}

test.describe("Arcade", () => {
  test("arcade load matrix renders all games", async ({ page }) => {
    const guard = await installNetworkGuard(page);
    const consoleWatch = watchConsole(page);

    await page.goto("/arcade/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#arcade-grid .po-arcade__card");

    const links = await page.$$eval("#arcade-grid a.po-arcade__btn--primary", (els) =>
      els.map((el) => el.getAttribute("href")).filter(Boolean)
    );

    expect(links.length).toBeGreaterThan(0);

    for (const href of links) {
      const response = await page.goto(href, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);

      await page.waitForSelector(surfaceSelector(), { timeout: 15000 });

      const hasConsole = (await page.locator(".arcade-page__topbar").count()) > 0;
      if (hasConsole) {
        await expect(page.locator("[aria-label='Back to Arcade']")).toBeVisible();
        await expect(page.locator("[aria-label='Restart game']")).toBeVisible();
        await expect(page.locator("[aria-label='Pause game']")).toBeVisible();
      } else {
        await expect(page.locator("#play-exit")).toBeVisible();
        await expect(page.locator("#play-restart")).toBeVisible();
        await expect(page.locator("#play-pause")).toBeVisible();
      }
    }

    expect(consoleWatch.errors).toEqual([]);
    expect(guard.blocked).toEqual([]);
  });

  test.describe("mobile input and scroll", () => {
    test.skip(({ project }) => project.name !== "mobile", "mobile-only checks");

    test("snake swipe and d-pad do not scroll", async ({ page }) => {
      const guard = await installNetworkGuard(page);
      const consoleWatch = watchConsole(page);

      await page.goto("/arcade/games/snake/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".po-sn-canvas");

      const startScroll = await page.evaluate(() => window.scrollY);

      await page.dispatchEvent(".po-sn-stage", "touchstart", {
        touches: [{ identifier: 1, clientX: 120, clientY: 200 }]
      });
      await page.dispatchEvent(".po-sn-stage", "touchend", {
        changedTouches: [{ identifier: 1, clientX: 160, clientY: 200 }]
      });

      await page.click("button[aria-label='Up']");

      const endScroll = await page.evaluate(() => window.scrollY);
      expect(endScroll).toBe(startScroll);

      expect(consoleWatch.errors).toEqual([]);
      expect(guard.blocked).toEqual([]);
    });

    test("pong drag does not scroll", async ({ page }) => {
      const guard = await installNetworkGuard(page);
      const consoleWatch = watchConsole(page);

      await page.goto("/arcade/games/pong/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".po-pg-canvas");

      const startScroll = await page.evaluate(() => window.scrollY);

      await page.dispatchEvent(".po-pg-stage", "pointerdown", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 120,
        clientY: 220
      });
      await page.dispatchEvent(".po-pg-stage", "pointermove", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 120,
        clientY: 260
      });
      await page.dispatchEvent(".po-pg-stage", "pointerup", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 120,
        clientY: 260
      });

      const endScroll = await page.evaluate(() => window.scrollY);
      expect(endScroll).toBe(startScroll);

      expect(consoleWatch.errors).toEqual([]);
      expect(guard.blocked).toEqual([]);
    });

    test("sudoku tap selects a cell", async ({ page }) => {
      const guard = await installNetworkGuard(page);
      const consoleWatch = watchConsole(page);

      await page.goto("/arcade/games/sudoku/", { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".po-sd-board");

      await page.click(".po-sd-cell");
      await expect(page.locator(".po-sd-cell.is-selected")).toHaveCount(1);

      expect(consoleWatch.errors).toEqual([]);
      expect(guard.blocked).toEqual([]);
    });
  });
});
