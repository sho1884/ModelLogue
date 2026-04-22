import { describe, it, expect } from 'vitest';
import {
  coverageToCsv,
  coverageToHtml,
  testCasesToCsv,
  testCasesToHtml,
} from '../../src/engines/testCasesSerializer';
import type { CoverageRow, TestCase } from '../../src/types/testCase';

const sample: TestCase[] = [
  {
    test_id: 'top-001',
    layer: 'top',
    length: 3,
    start: '[*]_init',
    sequence: '()|start|done',
    end: '[*]_final',
    covers:
      '[*]_init--()-->Idle;Idle--start-->Active;Active--done-->[*]_final',
  },
  {
    test_id: 'Operating-001',
    layer: 'Operating',
    length: 2,
    start: '[*]_init_Operating',
    sequence: 'pause|resume',
    end: 'Running',
    covers:
      '[*]_init_Operating--()-->Running;Running--pause-->Paused;Paused--resume-->Running',
  },
];

describe('testCasesSerializer (SR-102)', () => {
  it('CSV header matches §6.1', () => {
    const csv = testCasesToCsv(sample);
    expect(csv.split('\n')[0]).toBe(
      'test_id,layer,length,start,sequence,end,covers'
    );
  });

  it('CSV row preserves column order and types', () => {
    const csv = testCasesToCsv(sample);
    const rows = csv.split('\n');
    expect(rows[1]).toBe(
      'top-001,top,3,[*]_init,()|start|done,[*]_final,' +
        '[*]_init--()-->Idle;Idle--start-->Active;Active--done-->[*]_final'
    );
  });

  it('CSV RFC 4180: quotes cells containing commas, quotes, or newlines', () => {
    const withSpecials: TestCase[] = [
      {
        test_id: 'x-01',
        layer: 'top',
        length: 1,
        start: 'A',
        sequence: 'ev [g,h]',
        end: 'B',
        covers: 'A--ev [g,h]-->B',
      },
    ];
    const csv = testCasesToCsv(withSpecials);
    const row = csv.split('\n')[1];
    expect(row).toBe(
      'x-01,top,1,A,"ev [g,h]",B,"A--ev [g,h]-->B"'
    );
  });

  it('empty list yields header-only CSV', () => {
    expect(testCasesToCsv([])).toBe(
      'test_id,layer,length,start,sequence,end,covers'
    );
  });

  it('HTML renders a <table> with every column as <th>/<td>', () => {
    const html = testCasesToHtml(sample);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>test_id</th>');
    expect(html).toContain('<th>covers</th>');
    expect(html).toContain(
      '<th scope="row" style="font-weight:normal;text-align:left;">top-001</th>'
    );
    // length is right-aligned
    expect(html).toContain('<td style="text-align:right;">3</td>');
  });

  it('HTML escapes entities so embedded quotes render as &quot;', () => {
    const tests: TestCase[] = [
      {
        test_id: 'q-01',
        layer: 'top',
        length: 1,
        start: 'A',
        sequence: 'e / log("hi")',
        end: 'B',
        covers: 'A--e-->B',
      },
    ];
    const html = testCasesToHtml(tests);
    expect(html).toContain('e / log(&quot;hi&quot;)');
  });
});

const coverageSample: CoverageRow[] = [
  {
    kind: 'chain',
    layer: 'top',
    element: 'A --start--> B --done--> [*]_final',
    hits: { 'top-001': '#', 'top-002': 'x' },
    status: '',
    reason: '',
  },
  {
    kind: 'chain',
    layer: 'top',
    element: 'A --fail--> Err',
    hits: { 'top-001': '', 'top-002': '' },
    status: 'unreachable-within-cap',
    reason: 'no final-reaching or cycle-closing suffix within cap',
  },
];

const coverageTests: TestCase[] = [
  {
    test_id: 'top-001',
    layer: 'top',
    length: 2,
    start: '[*]_init',
    sequence: 'start|done',
    end: '[*]_final',
    covers: 'A--start-->B;B--done-->[*]_final',
  },
  {
    test_id: 'top-002',
    layer: 'top',
    length: 2,
    start: '[*]_init',
    sequence: 'start|done',
    end: '[*]_final',
    covers: 'A--start-->B;B--done-->[*]_final',
  },
];

describe('coverageToCsv / coverageToHtml (SR-102 §6.2)', () => {
  it('CSV header has kind, layer, element, each test_id, then status, reason', () => {
    const csv = coverageToCsv(coverageSample, coverageTests);
    expect(csv.split('\n')[0]).toBe(
      'kind,layer,element,top-001,top-002,status,reason'
    );
  });

  it('CSV hit markers land in the right test_id column; status/reason trail', () => {
    const csv = coverageToCsv(coverageSample, coverageTests);
    const rows = csv.split('\n');
    expect(rows[1]).toBe(
      'chain,top,A --start--> B --done--> [*]_final,#,x,,'
    );
    expect(rows[2]).toBe(
      'chain,top,A --fail--> Err,,,unreachable-within-cap,' +
        'no final-reaching or cycle-closing suffix within cap'
    );
  });

  it('CSV with zero tests still emits a well-formed header and rows', () => {
    const csv = coverageToCsv(coverageSample, []);
    const rows = csv.split('\n');
    expect(rows[0]).toBe('kind,layer,element,status,reason');
    expect(rows[1]).toBe(
      'chain,top,A --start--> B --done--> [*]_final,,'
    );
  });

  it('HTML renders a <table> whose <th>s match the test_id columns', () => {
    const html = coverageToHtml(coverageSample, coverageTests);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>top-001</th>');
    expect(html).toContain('<th>top-002</th>');
    // Element cell is <th scope="row"> so screen readers treat it as a row header
    expect(html).toContain(
      '<th scope="row" style="font-weight:normal;text-align:left;">' +
        'A --start--&gt; B --done--&gt; [*]_final</th>'
    );
    // Hit marker cells are center-aligned
    expect(html).toContain('<td style="text-align:center;">#</td>');
    expect(html).toContain('<td style="text-align:center;">x</td>');
  });
});
