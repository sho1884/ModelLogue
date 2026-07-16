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
import { EMPTY_CELL_DISPLAY, isEmptyCell } from '../types/matrix';

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialize the matrix as a faithful grid CSV — the visible table, one row per
 * row, `-` for a forbidden cell (SR-020), RFC 4180 quoting, CRLF.
 *
 * This is NOT the canonical state-transition-table CSV: that format
 * (`transitionTableSerializer`) is inherently state×event — its columns are
 * fixed as state,label,parent,type,initial,<events> and it round-trips with
 * modellogue-nswitch. It has no meaning for the PreState×PostState view, whose
 * axes are both states. So that tab exports THIS grid: what the user sees,
 * pivoted exactly as shown, for a spreadsheet — not a tool interchange.
 *
 * Composite indentation (a display-only affordance) is dropped; a CSV cell is
 * the plain label.
 */
export function matrixToCsv(matrix: MatrixData, title: string): string {
  const header = [title, ...matrix.columnHeaders].map(csvCell).join(',');
  const rows = matrix.rows.map((row, ri) => {
    const cells = matrix.cells[ri].map((c) =>
      isEmptyCell(c) ? EMPTY_CELL_DISPLAY : (c as string)
    );
    return [row.label, ...cells].map(csvCell).join(',');
  });
  return [header, ...rows].join('\r\n');
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
      // SR-020: an empty cell renders as `-` here exactly as it does on
      // screen — this payload is the human-facing table (Excel / Sheets /
      // Word), so it must say the same thing the reviewer saw. The plain-text
      // payload beside it is the canonical CSV, where empty stays empty.
      const dataCells = matrix.cells[ri]
        .map(
          (c) =>
            `<td>${isEmptyCell(c) ? EMPTY_CELL_DISPLAY : htmlEscape(c as string)}</td>`
        )
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
