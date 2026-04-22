// SR-101: serialize an on-screen state-transition matrix as HTML for
// clipboard copy. The HTML <table> is the text/html clipboard payload
// so spreadsheets / Word import it directly as a formatted table (Excel
// prefers HTML when both HTML and plain text are present).
//
// The plain-text clipboard payload and the .csv file download both use
// the canonical state-transition-table CSV produced by
// `transitionTableSerializer.modelToCanonicalCsv` — that format is
// defined in tools/nswitch/Requirements_Specification.md §4.2 and is
// the interchange format shared with the modellogue-nswitch CLI.

import type { MatrixData } from '../types/matrix';

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
