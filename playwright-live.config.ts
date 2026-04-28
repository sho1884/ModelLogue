// Playwright config for LIVE-AI debug tests under tests/e2e-live/.
//
// Differs from playwright.config.ts:
// - testDir points at tests/e2e-live (gitignored, manual-only)
// - webServer does NOT force VITE_USE_MOCK_AI; it inherits .env.local
//   so the test actually hits Gemini via n8n.
//
// Each test in this config costs real Gemini quota. Run sparingly.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e-live',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium-live',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // No VITE_USE_MOCK_AI override — the dev server reads whatever
    // .env.local says. Maintainer should set VITE_USE_MOCK_AI=false
    // (or unset it) before running.
    command: 'npm run dev -- --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
