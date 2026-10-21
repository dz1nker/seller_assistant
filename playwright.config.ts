import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
config({ quiet: true });
const url = new URL(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost/sales_copilot');
if (!process.env.E2E_DATABASE_URL) url.pathname = '/sales_copilot_e2e_test';
if (!/^[a-z][a-z0-9_]*_test$/.test(url.pathname.slice(1))) throw new Error('E2E tests require a dedicated *_test database');
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 45000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { executablePath: chromiumPath, chromiumSandbox: process.env.PLAYWRIGHT_NO_SANDBOX !== 'true' } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node scripts/prepare-test-db.mjs && npm run start -w @sales/api', url: 'http://127.0.0.1:4100/health/ready', reuseExistingServer: false,
      env: { DATABASE_URL: url.toString(), API_PORT: '4100', WEB_ORIGIN: 'http://localhost:3100', COOKIE_SECURE: 'false', NODE_ENV: 'test' } },
    { command: 'npm run dev -w @sales/web -- --port 3100', url: 'http://localhost:3100/login', reuseExistingServer: false, timeout: 90000,
      env: { INTERNAL_API_URL: 'http://127.0.0.1:4100', NEXT_TELEMETRY_DISABLED: '1' } },
  ],
});
