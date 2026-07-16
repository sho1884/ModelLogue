// Smoke test — the matrix export path, driven through the real app.
//
// The unit tests cover each serializer, but nothing checked what actually
// reaches the clipboard or the file: the Copy button hands the browser TWO
// payloads (text/html for spreadsheets, text/plain for everything else) and
// Save .csv writes a third artifact. That gap is how the HTML payload shipped
// blank while the on-screen table showed `-` — every unit test passed.
//
// So this asserts the property a user experiences: what you see in the table
// is what lands in the editor and in the file.

import { test, expect } from '@playwright/test';

test('Copy and Save .csv carry the table, marker and all', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  // Seed a real model through the scenario runner (same as the other smokes).
  const runnerSelect = page
    .getByText('Debug · Scenario Runner')
    .locator('xpath=ancestor::div[1]')
    .locator('select');
  await runnerSelect.selectOption({ index: 0 });
  await page.getByRole('button', { name: /▶\s*Play/ }).click();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toBeVisible();
  await expect(page.getByText(/Step \d+ \/ \d+/)).toHaveCount(0, {
    timeout: 60_000,
  });

  await page.getByRole('button', { name: /State×Event/ }).click();
  const table = page.locator('table').first();
  await expect(table).toBeVisible();

  // The screen is the reference: it must show at least one forbidden cell for
  // this assertion to mean anything (scenario 01 has plenty).
  const onScreen = await table.innerText();
  expect(onScreen, 'the seeded model has no forbidden cell to check').toContain(
    '-'
  );

  await page.getByRole('button', { name: 'Copy' }).first().click();
  // The write is async; ExportActions only shows "Copied!" once it resolves,
  // so that label — not a sleep — is the point where the clipboard is settled.
  await expect(page.getByText('Copied!')).toBeVisible();

  // --- Copy: text/html is what a spreadsheet imports (Excel prefers it when
  // both flavours are present, so this — not the plain text — is what most
  // people actually paste). This is the payload that shipped with <td></td>
  // while the screen said `-`. ---
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        return await (await item.getType('text/html')).text();
      }
    }
    return '';
  });
  expect(html, 'no text/html payload — spreadsheets get nothing').not.toBe('');
  expect(html).toMatch(/<table[^>]*>/);
  expect(html, 'an empty cell reached the clipboard blank').not.toContain(
    '<td></td>'
  );
  expect(html, 'the marker the screen shows is missing from the HTML').toContain(
    '<td>-</td>'
  );

  // --- Copy: text/plain is the canonical CSV (what an editor receives) ---
  const plain = await page.evaluate(() => navigator.clipboard.readText());

  expect(plain, 'clipboard is empty — Copy produced nothing').not.toBe('');
  expect(plain.split('\r\n')[0]).toMatch(
    /^state,label,parent,type,initial,/
  );
  // §4.2.2: a forbidden pair is marked, never blank. `,,` in a body column
  // would be the bug this test exists for — but the metadata columns are
  // legitimately empty, so check a row's event section only.
  const bodyRow = plain
    .split('\r\n')
    .slice(1)
    .find((l) => l.includes(',normal,'))!;
  expect(bodyRow, 'no state row in the CSV').toBeTruthy();
  expect(bodyRow.split(',').slice(5), 'event cells are blank').not.toContain('');

  // --- Save .csv: the file must be the same artifact, not an empty file ---
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save \.csv/ }).first().click();
  const download = await dl;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const fileText = Buffer.concat(chunks).toString('utf-8');

  expect(fileText, 'downloaded file is empty').not.toBe('');
  expect(fileText, 'the file and the clipboard disagree').toBe(plain);
  expect(download.suggestedFilename()).toMatch(/transitions.*\.csv$/);

  // --- the two matrix tabs must export DIFFERENT files ---
  // They show different tables (State×Event vs PreState×PostState) but used to
  // download the same canonical CSV, because the download was derived from the
  // model and ignored which matrix was on screen.
  await page.getByRole('button', { name: /State×State/ }).click();
  await expect(page.locator('table').first()).toBeVisible();

  const dl2 = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save \.csv/ }).first().click();
  const download2 = await dl2;
  const stream2 = await download2.createReadStream();
  const chunks2: Buffer[] = [];
  for await (const c of stream2) chunks2.push(c as Buffer);
  const fileText2 = Buffer.concat(chunks2).toString('utf-8');

  expect(fileText2, 'State×State download is empty').not.toBe('');
  expect(
    fileText2,
    'the two tabs downloaded the same file — the bug'
  ).not.toBe(fileText);
  // The State×State grid is not the nswitch interchange format.
  expect(fileText2).not.toContain('state,label,parent,type,initial');
  expect(
    download2.suggestedFilename(),
    'the two downloads even share a filename'
  ).not.toBe(download.suggestedFilename());
});
