// Playwright config for ModelLogue end-to-end / smoke tests.
//
// Two test directories:
// - tests/e2e/        committed, mock-AI smoke tests, run on every push
// - tests/e2e-live/   git-ignored, optional real-AI tests, manual only
//
// We do NOT auto-start the dev server here. The test runner reuses
// whatever dev server is already running on localhost:5173, falling
// back to spinning one up if absent. This avoids stomping on a
// developer's running instance.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Real-AI debug specs live in a separate folder we don't run by
  // default; opt in with `npx playwright test --config tests/e2e-live`
  // or by passing the file path explicitly.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Reuse an already-running dev server (developer's local) when
    // present; otherwise spin one up with mock AI on so tests don't
    // hit the real Gemini.
    command: 'VITE_USE_MOCK_AI=true npm run dev -- --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
