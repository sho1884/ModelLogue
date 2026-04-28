// Vitest-specific config — keeps Playwright e2e specs out of the
// unit-test discovery tree.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Same default include as vitest, but exclude the e2e specs that
    // are driven by Playwright.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      'tests/e2e-live/**',
    ],
  },
});
