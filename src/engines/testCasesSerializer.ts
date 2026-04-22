// SR-102: serialize the nswitch test-case list and coverage report for
// Copy / Save.
//
// CSV shapes match tools/nswitch/Requirements_Specification.md
//   - §6.1 for the test case list
//   - §6.2 for the coverage report
// so files saved here are byte-identical to the CLI's stdout (which
// modellogue-nswitch derives from the same sections). That equivalence
// is the ADR-011 promise: the same model + N always yields the same
// artifact regardless of which surface produced it.

import type { CoverageRow, TestCase } from '../types/testCase';

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

// ---- coverage report (§6.2) ----

function coverageHeader(tests: TestCase[]): string[] {
  return [
    'kind',
    'layer',
    'element',
    ...tests.map((t) => t.test_id),
    'status',
    'reason',
  ];
}

export function coverageToCsv(
  coverage: CoverageRow[],
  tests: TestCase[]
): string {
  const header = coverageHeader(tests);
  const lines: string[] = [header.map(csvCell).join(',')];
  for (const row of coverage) {
    const cells = [
      row.kind,
      row.layer,
      row.element,
      ...tests.map((t) => row.hits[t.test_id] ?? ''),
      row.status,
      row.reason,
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return lines.join('\n');
}

export function coverageToHtml(
  coverage: CoverageRow[],
  tests: TestCase[]
): string {
  const header =
    `<thead><tr>` +
    coverageHeader(tests)
      .map((h) => `<th>${htmlEscape(h)}</th>`)
      .join('') +
    `</tr></thead>`;

  const body =
    `<tbody>` +
    coverage
      .map(
        (row) =>
          `<tr>` +
          `<td>${htmlEscape(row.kind)}</td>` +
          `<td>${htmlEscape(row.layer)}</td>` +
          `<th scope="row" style="font-weight:normal;text-align:left;">${htmlEscape(row.element)}</th>` +
          tests
            .map(
              (t) =>
                `<td style="text-align:center;">` +
                `${htmlEscape(row.hits[t.test_id] ?? '')}` +
                `</td>`
            )
            .join('') +
          `<td>${htmlEscape(row.status)}</td>` +
          `<td>${htmlEscape(row.reason)}</td>` +
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
