import { defineConfig, devices } from '@playwright/test';
import { z } from 'zod';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  expect: {
    timeout: z.coerce
      .number()
      .int()
      .positive()
      .parse(process.env.PLAYWRIGHT_EXPECT_TIMEOUT ?? 5000),
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_ALLOW_TEST_TLS === '1',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    baseURL === 'http://localhost:5173'
      ? { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 60000 }
      : undefined,
});
