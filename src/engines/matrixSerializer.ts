// SR-101 (v7.2): serialize a state-transition matrix for export.
//
// Two formats:
//   - CSV: comma-separated, RFC 4180 quoting. Used for the .csv file
//     download AND as the text/plain payload on clipboard copy — CSV
//     is the canonical interchange format for the downstream uses
//     (repository commit, AI prompt input, test-generation pipeline).
//   - HTML: a real <table>. Used as the text/html payload on clipboard
//     copy so spreadsheets / Word import it directly as a formatted
//     table (Excel prefers HTML when both are present).
//
// Layout mirrors the on-screen hybrid pattern: composite rows are
// followed by their indented child rows. The top-left cell carries
// the table title.

import type { MatrixData } from '../types/matrix';

const INDENT = '  '; // two spaces per level

function indentLabel(label: string, level: number): string {
  return INDENT.repeat(level) + label;
}

function buildRows(matrix: MatrixData, title: string): string[][] {
  const header: string[] = [title, ...matrix.columnHeaders];
  const body: string[][] = matrix.rows.map((row, ri) => [
    indentLabel(row.label, row.level),
    ...matrix.cells[ri].map((c) => c ?? ''),
  ]);
  return [header, ...body];
}

function csvCell(s: string): string {
  // RFC 4180: quote if the field contains comma, quote, CR, or LF.
  // Inside quotes, embedded quotes are doubled.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function matrixToCsv(matrix: MatrixData, title: string): string {
  const rows = buildRows(matrix, title);
  return rows.map((cols) => cols.map(csvCell).join(',')).join('\r\n');
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serialize the matrix as an HTML <table>. Excel / Google Sheets / Numbers
 * detect this MIME type on paste and produce a real spreadsheet table —
 * better than TSV (which can be misinterpreted by some pasting heuristics).
 *
 * Composite-state rows get a class so they look distinct in tools that
 * honor minimal styling (Excel typically ignores classes; we add inline
 * `font-weight: bold` for that reason).
 */
export function matrixToHtml(matrix: MatrixData, title: string): string {
  const indentChars = (level: number) =>
    level > 0 ? '&nbsp;'.repeat(level * 4) : '';

  const headerCells = [
    `<th>${htmlEscape(title)}</th>`,
    ...matrix.columnHeaders.map((c) => `<th>${htmlEscape(c)}</th>`),
  ];

  const bodyRows = matrix.rows
    .map((row, ri) => {
      const isComp = row.isComposite;
      const labelCell =
        `<th scope="row" style="${
          isComp ? 'font-weight:bold;' : 'font-weight:normal;'
        }text-align:left;">` +
        `${indentChars(row.level)}${htmlEscape(row.label)}` +
        `</th>`;
      const dataCells = matrix.cells[ri]
        .map((c) => `<td>${c == null ? '' : htmlEscape(c)}</td>`)
        .join('');
      return `<tr>${labelCell}${dataCells}</tr>`;
    })
    .join('');

  return (
    `<table border="1" cellspacing="0" cellpadding="4">` +
    `<thead><tr>${headerCells.join('')}</tr></thead>` +
    `<tbody>${bodyRows}</tbody>` +
    `</table>`
  );
}
