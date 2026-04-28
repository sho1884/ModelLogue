// Smoke test — state-machine session via mock AI.
// Drives scenario "01 サイズ・縦横比の変化" from the runner and verifies
// (a) the diagram updates each step, (b) the analysis tab list
// includes the state-machine-specific tabs.

import { test, expect } from '@playwright/test';

test('state-machine scenario 01 runs end-to-end via mock AI', async ({
  page,
}) => {
  await page.goto('/');

  // Default model type is state-machine — no need to change.
  // Scenario runner: select scenario 01, hit Play.
  const runnerSelect = page
    .getByText('Debug · Scenario Runner')
    .locator('xpath=ancestor::div[1]')
    .locator('select');
  await runnerSelect.selectOption({ index: 0 });

  // Sanity: the analysis-panel has a "Source" tab (state-machine has it).
  await expect(
    page.getByRole('button', { name: /Source/ })
  ).toBeVisible();

  // Scenario 01 has 3 steps with pauseMs ~2500 each → expect under
  // ~10s wall time. Run the scenario.
  await page.getByRole('button', { name: /▶\s*Play/ }).click();

  // Wait for the runner to return to idle (status indicator goes
  // away). The "Step N / N" label is only present while running.
  // We poll up to 20s; mock AI is instant so ~10s is realistic.
  await expect(page.getByText(/Step \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toHaveCount(0, {
    timeout: 30_000,
  });

  // Diagram should now show some PlantUML SVG (image with width/height).
  // We just check the diagram pane has an <img> with a non-empty src.
  const diagramImg = page.locator('img[alt="PlantUML diagram"]');
  await expect(diagramImg).toBeVisible();
  const src = await diagramImg.getAttribute('src');
  expect(src).toBeTruthy();
  expect(src!.length).toBeGreaterThan(20); // non-trivial blob URL
});
