// SR-102: serialize the nswitch test-case list for Copy / Save.
//
// The CSV shape matches tools/nswitch/Requirements_Specification.md §6.1
// so a file saved here is byte-identical to the CLI's default stdout
// (which `modellogue-nswitch` also derives from §6.1). That equivalence
// is the ADR-011 promise: the same model + N always yields the same
// artifact regardless of which surface produced it.

import type { TestCase } from '../types/testCase';

const CSV_HEADER = [
  'test_id',
  'layer',
  'length',
  'start',
  'sequence',
  'end',
  'covers',
];

function csvCell(s: string | number): string {
  const text = String(s);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function testCasesToCsv(tests: TestCase[]): string {
  const lines: string[] = [CSV_HEADER.join(',')];
  for (const t of tests) {
    lines.push(
      [
        t.test_id,
        t.layer,
        t.length,
        t.start,
        t.sequence,
        t.end,
        t.covers,
      ]
        .map(csvCell)
        .join(',')
    );
  }
  // LF line endings (nswitch CLI writes LF too; see server/cli output).
  return lines.join('\n');
}

function htmlEscape(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serialize the test list as an HTML <table>. Excel / Google Sheets /
 * Numbers prefer HTML when both MIME types are on the clipboard, so this
 * gives users a formatted paste by default while keeping the plain-text
 * payload CSV-consumable for CI configs and text editors.
 */
export function testCasesToHtml(tests: TestCase[]): string {
  const header =
    `<thead><tr>` +
    CSV_HEADER.map((h) => `<th>${htmlEscape(h)}</th>`).join('') +
    `</tr></thead>`;
  const body =
    `<tbody>` +
    tests
      .map(
        (t) =>
          `<tr>` +
          `<th scope="row" style="font-weight:normal;text-align:left;">${htmlEscape(t.test_id)}</th>` +
          `<td>${htmlEscape(t.layer)}</td>` +
          `<td style="text-align:right;">${htmlEscape(t.length)}</td>` +
          `<td>${htmlEscape(t.start)}</td>` +
          `<td>${htmlEscape(t.sequence)}</td>` +
          `<td>${htmlEscape(t.end)}</td>` +
          `<td>${htmlEscape(t.covers)}</td>` +
          `</tr>`
      )
      .join('') +
    `</tbody>`;
  return (
    `<table border="1" cellspacing="0" cellpadding="4">` +
    header +
    body +
    `</table>`
  );
}
