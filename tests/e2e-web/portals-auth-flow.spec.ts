import { expect, test } from '@playwright/test';

type Role = 'ADMIN' | 'TUTOR' | 'STUDENT';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3101';

async function loginAs(page: import('@playwright/test').Page, role: Role, email: string) {
  const response = await page.request.post(`${apiBaseUrl}/test/login-as`, {
    data: { role, email },
  });

  expect(response.ok()).toBeTruthy();

  const cookieHeaders = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);

  if (cookieHeaders.length > 0) {
    const parsed = cookieHeaders
      .map((value) => value.split(';', 1)[0])
      .map((pair) => {
        const idx = pair.indexOf('=');
        return idx >= 0 ? { name: pair.slice(0, idx), value: pair.slice(idx + 1) } : null;
      })
      .filter((entry): entry is { name: string; value: string } => Boolean(entry));

    await page.context().addCookies(
      parsed.map((entry) => ({
        name: entry.name,
        value: entry.value,
        url: apiBaseUrl,
      }))
    );
  }
}

async function expectSessionRole(page: import('@playwright/test').Page, role: Role) {
  const session = await page.evaluate(async (apiBase) => {
    const response = await fetch(`${apiBase}/auth/session`, { credentials: 'include' });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const body = await response.json();
    return { ok: true, role: body?.user?.role };
  }, apiBaseUrl);

  expect(session.ok).toBeTruthy();
  expect(session.role).toBe(role);
}

test('admin pages redirect to admin login when unauthenticated', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/login\.html$/);
});

test('tutor pages redirect to tutor login when unauthenticated', async ({ page }) => {
  await page.goto('/tutor/dashboard/');
  await expect(page).toHaveURL(/\/tutor\/login\.html$/);
});

test('student pages redirect to student login when unauthenticated', async ({ page }) => {
  await page.goto('/dashboard/');
  await expect(page).toHaveURL(/\/dashboard\/login\.html$/);
});

test('student login request-link flow shows confirmation state', async ({ page }) => {
  await page.goto('/dashboard/login.html');

  await page.fill('#email', 'student-ui-e2e@test.local');
  await page.click('button[type="submit"]');

  await expect(page.locator('#stepSent')).toBeVisible();
  await expect(page.locator('#sentMessage')).toContainText('student-ui-e2e@test.local');
});

test('tutor login displays invalid credentials feedback', async ({ page }) => {
  await page.goto('/tutor/login.html');

  await page.fill('#email', 'bad-tutor@test.local');
  await page.fill('#password', 'wrong-password');
  await page.click('button[type="submit"]');

  await expect(page.locator('#loginFeedback')).toContainText('Incorrect email or password.');
});

test('admin login displays invalid credentials feedback', async ({ page }) => {
  await page.goto('/admin/login.html');

  await page.fill('#email', 'bad-admin@test.local');
  await page.fill('#password', 'wrong-password');
  await page.click('button[type="submit"]');

  await expect(page.locator('#passwordFeedback')).toContainText('Incorrect email or password.');
});

test('admin can access admin portal after test login bootstrap', async ({ page }) => {
  await loginAs(page, 'ADMIN', 'admin-browser-e2e@test.local');

  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page).toHaveTitle(/Admin Dashboard/);
  await expectSessionRole(page, 'ADMIN');
});

test('tutor can access tutor portal after test login bootstrap', async ({ page }) => {
  await loginAs(page, 'TUTOR', 'tutor-browser-e2e@test.local');

  await page.goto('/tutor/dashboard/');
  await expect(page).toHaveURL(/\/tutor\/dashboard\/?$/);
  await expectSessionRole(page, 'TUTOR');
});

test('student can access dashboard after test login bootstrap', async ({ page }) => {
  await loginAs(page, 'STUDENT', 'student-browser-e2e@test.local');

  await page.goto('/dashboard/');
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await expectSessionRole(page, 'STUDENT');
});
