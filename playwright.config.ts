import { defineConfig } from '@playwright/test';

const webBaseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:8080';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3101';
const databaseUrlTest = process.env.DATABASE_URL_TEST ?? 'postgresql://postgres:postgres@127.0.0.1:5432/lms_test';

export default defineConfig({
  testDir: './tests/e2e-web',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run build:static && npm run build:css && npm run inject:config && npx http-server dist -p 8080 -c-1',
      url: `${webBaseUrl}/index.html`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        API_BASE_URL: apiBaseUrl,
        PUBLIC_PO_API_BASE: apiBaseUrl,
      },
    },
    {
      command: 'npm run db:migrate:test --prefix lms-api && npm run db:reset:test --prefix lms-api && npm run seed:test --prefix lms-api && npm run start:test --prefix lms-api',
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL_TEST: databaseUrlTest,
        API_BASE_URL: apiBaseUrl,
        PUBLIC_PO_API_BASE: apiBaseUrl,
        PORT: String(new URL(apiBaseUrl).port || '3101'),
        COOKIE_DOMAIN: '',
        COOKIE_SECRET: process.env.COOKIE_SECRET ?? 'test_cookie_secret_value_for_e2e_web',
        JWT_SECRET: process.env.JWT_SECRET ?? 'test_jwt_secret_value_for_e2e_web',
      },
    },
  ],
});
