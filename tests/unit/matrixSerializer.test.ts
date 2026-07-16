import { describe, it, expect } from 'vitest';
import { matrixToHtml, matrixToCsv } from '../../src/engines/matrixSerializer';
import type { MatrixData } from '../../src/types/matrix';
import { EMPTY_CELL_DISPLAY } from '../../src/types/matrix';

const sample: MatrixData = {
  rows: [
    { stateId: 'C', label: 'Composite', level: 0, isComposite: true },
    { stateId: 'A', label: 'A', level: 1, isComposite: false },
    { stateId: 'B', label: 'B', level: 1, isComposite: false },
  ],
  columnHeaders: ['start', 'go,now'],
  cells: [
    [null, 'X'],
    ['A', null],
    [null, 'A "next"'],
  ],
};

describe('matrixSerializer (SR-101)', () => {
  it('HTML: produces a real <table> with composite-row bold styling', () => {
    const html = matrixToHtml(sample, 'State / Event');
    expect(html).toMatch(/<table[^>]*>/);
    expect(html).toContain('<th>State / Event</th>');
    // Composite row label is bold and indented at level 0 (no indent)
    expect(html).toMatch(
      /<th scope="row" style="font-weight:bold;[^"]*">Composite<\/th>/
    );
    // Child row gets non-bold and indented (4 nbsp per level)
    expect(html).toContain(
      '<th scope="row" style="font-weight:normal;text-align:left;">' +
        '&nbsp;&nbsp;&nbsp;&nbsp;A</th>'
    );
    // Cells with quotes get HTML-escaped
    expect(html).toContain('<td>A &quot;next&quot;</td>');
  });

  // SR-020 / UR-013. This payload is what a spreadsheet or Word receives, so
  // it is a *human*-facing rendering and must say what the screen says: `-`,
  // not blank. It shipped blank while the on-screen table said `-`, because
  // the two rendered the marker independently and only one was updated.
  it('HTML: an empty cell renders as `-`, matching the on-screen table', () => {
    const html = matrixToHtml(sample, 'State / Event');
    expect(html).not.toContain('<td></td>');
    // sample has three empty cells (null) — all must carry the marker.
    expect(html.match(/<td>-<\/td>/g)).toHaveLength(3);
  });

  it('HTML: treats an empty-string cell as empty too, not as a value', () => {
    const withBlank: MatrixData = {
      ...sample,
      cells: [
        ['', 'X'],
        ['A', null],
        [null, 'A "next"'],
      ],
    };
    const html = matrixToHtml(withBlank, 'State / Event');
    expect(html).not.toContain('<td></td>');
    expect(html.match(/<td>-<\/td>/g)).toHaveLength(3);
  });

  it('HTML: the marker is the shared constant, so it cannot drift from the view', () => {
    const html = matrixToHtml(sample, 'State / Event');
    expect(html).toContain(`<td>${EMPTY_CELL_DISPLAY}</td>`);
  });
});

describe('matrixToCsv (grid CSV for the PreState×PostState tab)', () => {
  it('serializes the visible grid: corner title, headers, one row each', () => {
    const csv = matrixToCsv(sample, 'From \\ To');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('From \\ To,start,"go,now"'); // header comma-quoted
    expect(lines[1]).toBe('Composite,-,X'); // null cell → marker
    expect(lines[2]).toBe('A,A,-');
    expect(lines[3]).toBe('B,-,"A ""next"""'); // quote escaping
  });

  it('uses the same empty-cell marker as the screen and the HTML', () => {
    // The three renderings of one table must agree. Feed a matrix that is all
    // empty and every body cell must be the marker, never blank.
    const empty: MatrixData = {
      rows: [{ stateId: 'A', label: 'A', level: 0, isComposite: false }],
      columnHeaders: ['e'],
      cells: [[null]],
    };
    expect(matrixToCsv(empty, 'T')).toBe(`T,e\r\nA,${EMPTY_CELL_DISPLAY}`);
  });

  it('is NOT the canonical CSV — no state/label/parent/type/initial header', () => {
    // Guards the whole point of this function: the state×state grid must not
    // masquerade as the nswitch interchange format.
    expect(matrixToCsv(sample, 'From \\ To')).not.toContain(
      'state,label,parent,type,initial'
    );
  });
});
