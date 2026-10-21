import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost/sales_copilot');
if (!process.env.TEST_DATABASE_URL) url.pathname = '/sales_copilot_test';
if (!url.pathname.endsWith('_test')) throw new Error('Integration tests require a dedicated database whose name ends with _test');
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
export default defineConfig({
  test: { include: ['tests/integration/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 15000, hookTimeout: 30000 },
});
