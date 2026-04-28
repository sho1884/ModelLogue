// Smoke test — requirement session via mock AI.
// Switches to Requirement model type, runs scenario 08
// (initial → modify → add) and verifies the Requirement list tab
// populates with the expected 4 rows.

import { test, expect } from '@playwright/test';

test('requirement scenario 08 runs and populates the list tab', async ({
  page,
}) => {
  await page.goto('/');

  // Switch to Requirement type via header dropdown.
  const headerSelect = page.locator('select').first();
  await headerSelect.selectOption('requirement');

  // Pick scenario 08 in the runner. selectOption by label is robust
  // against ordering changes.
  const runnerSelect = page
    .getByText('Debug · Scenario Runner')
    .locator('xpath=ancestor::div[1]')
    .locator('select');
  await runnerSelect.selectOption({
    label: 'Requirement: 初期生成 → 書き換え → 追加',
  });

  await page.getByRole('button', { name: /▶\s*Play/ }).click();

  // Wait for runner to finish.
  await expect(page.getByText(/Step \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toHaveCount(0, {
    timeout: 30_000,
  });

  // Open the Requirement list tab.
  await page.getByRole('button', { name: 'Requirement list' }).click();

  // After scenario 08 step 3, the requirement list should have 4
  // requirements (R1, R2, C1, Q1).
  // Check that all four ids are visible in the table.
  for (const id of ['R1', 'R2', 'C1', 'Q1']) {
    await expect(page.getByRole('cell', { name: id }).first()).toBeVisible();
  }
});
