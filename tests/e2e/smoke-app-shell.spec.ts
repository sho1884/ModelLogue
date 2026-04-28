// Phase 1 smoke test — minimal: app shell renders, scenario runner
// shows up under VITE_USE_MOCK_AI=true, model-type selector lists
// the three registered types.
//
// Deliberately small. Establishes that the harness works end-to-end
// (Playwright launches Chromium → reaches dev server → DOM renders).
// The model-type-specific scenario tests sit in their own files.

import { test, expect } from '@playwright/test';

test.describe('app shell', () => {
  test('renders model-type selector with all three types', async ({
    page,
  }) => {
    await page.goto('/');
    // Model selector is a label "Model:" followed by a <select>.
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    const options = await select.locator('option').allInnerTexts();
    expect(options).toEqual(
      expect.arrayContaining([
        'State machine',
        'Requirement',
        'Process (business workflow)',
      ])
    );
  });

  test('shows the scenario runner when mock AI is enabled', async ({
    page,
  }) => {
    await page.goto('/');
    // Title bar of the runner panel.
    await expect(
      page.getByText('Debug · Scenario Runner')
    ).toBeVisible();
  });
});
