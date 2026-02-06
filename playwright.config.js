const { defineConfig, devices } = require("@playwright/test");

const databaseUrl = process.env.DATABASE_URL_TEST || "postgresql://postgres:postgres@localhost:5432/lms_test";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/playwright-junit.xml" }]
  ],
  outputDir: "test-results/playwright",
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm run start:static:test",
      url: "http://localhost:8080",
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: "npm run start:test --prefix lms-api > lms-api/test-results/api.log 2>&1",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        PUBLIC_BASE_URL: "http://localhost:3001",
        COOKIE_SECRET: "test-cookie-secret",
        JWT_SECRET: "test-jwt-secret",
        PORT: "3001"
      }
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 12"] }
    }
  ]
});
