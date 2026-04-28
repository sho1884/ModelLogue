// Smoke test — process session via mock AI.
// Switches to Process model type, runs scenario 10 (apply basics)
// and verifies (a) the diagram updates, (b) the Scenarios tab
// populates with at least one path row.

import { test, expect } from '@playwright/test';

test('process scenario 10 runs and Scenarios tab populates', async ({
  page,
}) => {
  await page.goto('/');

  // Switch to Process type.
  const headerSelect = page.locator('select').first();
  await headerSelect.selectOption('process');

  // Pick scenario 10 in the runner.
  const runnerSelect = page
    .getByText('Debug · Scenario Runner')
    .locator('xpath=ancestor::div[1]')
    .locator('select');
  await runnerSelect.selectOption({
    label: 'Process: 初期生成 → 追加 → レーン変更',
  });

  await page.getByRole('button', { name: /▶\s*Play/ }).click();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toHaveCount(0, {
    timeout: 30_000,
  });

  // Process tab list should have Scenarios / Events / Roles /
  // Artifacts / Externals plus the common Requirements / Source.
  for (const tab of ['Scenarios', 'Events', 'Roles', 'Artifacts', 'Externals']) {
    await expect(
      page.getByRole('button', { name: tab })
    ).toBeVisible();
  }

  // Open Scenarios — should have at least 1 path row.
  await page.getByRole('button', { name: 'Scenarios' }).click();
  // Scenarios table renders one row per path; the row id column is
  // P1 / P2 / ... — assert at least P1 is visible.
  await expect(page.getByText('P1')).toBeVisible();

  // Diagram refreshed.
  const diagramImg = page.locator('img[alt="PlantUML diagram"]');
  await expect(diagramImg).toBeVisible();
});
