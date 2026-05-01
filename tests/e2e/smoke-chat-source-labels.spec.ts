// SR-134 smoke — chat bubbles render a source label per speaker class.
//
// Goal: after scenario 01 has driven a few mock-AI rounds, the chat
// pane shows "You" labels above facilitator messages and "AI" labels
// above assistant messages. Slack · <name> rendering is exercised by
// the unit test (chatMessageSource.test.ts) since SR-132 hasn't
// landed yet — there is no producer of slack:<name> messages here.

import { test, expect } from '@playwright/test';

test('chat pane renders source labels (You / AI) on bubbles', async ({
  page,
}) => {
  await page.goto('/');

  // Drive the same scenario as smoke-state-machine: it issues a few
  // facilitator → AI rounds, which is exactly what we need to see
  // both label classes in one shot.
  const runnerSelect = page
    .getByText('Debug · Scenario Runner')
    .locator('xpath=ancestor::div[1]')
    .locator('select');
  await runnerSelect.selectOption({ index: 0 });
  await page.getByRole('button', { name: /▶\s*Play/ }).click();

  // Wait for the runner to finish (Step N/N label disappears).
  await expect(page.getByText(/Step \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toHaveCount(0, {
    timeout: 30_000,
  });

  // After the scenario, both "You" and "AI" labels must be visible
  // in the chat pane. `getByText` with `exact: true` so we don't
  // collide with substrings elsewhere.
  await expect(page.getByText('You', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('AI', { exact: true }).first()).toBeVisible();
});
