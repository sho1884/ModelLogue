import { describe, it, expect } from 'vitest';
import {
  matrixToCsv,
  matrixToHtml,
} from '../../src/engines/matrixSerializer';
import type { MatrixData } from '../../src/types/matrix';

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

  it('CSV: RFC 4180 quoting for commas and quotes', () => {
    const csv = matrixToCsv(sample, 'State / Event');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('State / Event,start,"go,now"');
    expect(lines[1]).toBe('Composite,,X');
    expect(lines[2]).toBe('  A,A,');
    // Embedded quote becomes "" and the whole field is quoted
    expect(lines[3]).toBe('  B,,"A ""next"""');
  });
});
