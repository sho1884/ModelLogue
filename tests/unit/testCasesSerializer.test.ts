import { describe, it, expect } from 'vitest';
import {
  scenariosToCsv,
  scenariosToHtml,
  testCasesToCsv,
  testCasesToHtml,
} from '../../src/engines/testCasesSerializer';
import type { Scenario, Test } from '../../src/types/testCase';

// Positive Tests (§6.1, columnar). Byte-equivalent to generate.py tests_to_csv.
const positive: Test[] = [
  {
    id: 'watch-1S-001',
    type: '1S',
    scope: 'watch',
    start: 'Active',
    steps: [
      { event: 'stop', reached: 'Idle' },
      { event: 'start', reached: 'Active' },
    ],
    event: '',
    expect: '',
    reach: '',
    scenarios: ['watch-SC-001'],
  },
  {
    id: 'watch-1S-002',
    type: '1S',
    scope: 'watch',
    start: 'Idle',
    steps: [{ event: 'start', reached: 'Active' }],
    event: '',
    expect: '',
    reach: '',
    scenarios: ['watch-SC-001', 'watch-SC-002'],
  },
];

const invalid: Test[] = [
  {
    id: 'watch-INV-001',
    type: 'INV',
    scope: 'watch',
    start: 'Idle',
    steps: [],
    event: 'stop',
    expect: 'no-transition',
    scenarios: [],
  },
];

describe('testCasesToCsv (SR-103 §6.1)', () => {
  it('positive Tests: columnar header padded to the longest chain', () => {
    const csv = testCasesToCsv(positive);
    expect(csv.split('\n')[0]).toBe(
      'seq,id,start,event_1,reached_1,event_2,reached_2,scenarios'
    );
  });

  it('positive Tests: rows carry seq, steps, and ;-joined scenarios (short rows padded)', () => {
    const rows = testCasesToCsv(positive).split('\n');
    expect(rows[1]).toBe('1,watch-1S-001,Active,stop,Idle,start,Active,watch-SC-001');
    // Shorter chain pads the trailing (event_2, reached_2) cells.
    expect(rows[2]).toBe(
      '2,watch-1S-002,Idle,start,Active,,,watch-SC-001;watch-SC-002'
    );
  });

  it('output ends with a trailing newline (byte-equal to the CLI)', () => {
    expect(testCasesToCsv(positive).endsWith('\n')).toBe(true);
  });

  it('all-INV list switches to the negative shape', () => {
    const rows = testCasesToCsv(invalid).split('\n');
    expect(rows[0]).toBe('seq,id,start,event,expect');
    expect(rows[1]).toBe('1,watch-INV-001,Idle,stop,no-transition');
  });

  it('empty list yields header-only CSV', () => {
    // No tests => not "all INV" => positive header with zero step columns.
    expect(testCasesToCsv([])).toBe('seq,id,start,scenarios\n');
  });

  it('RFC 4180: quotes cells containing commas', () => {
    const withComma: Test[] = [
      {
        id: 'x-1S-001',
        type: '1S',
        scope: 'x',
        start: 'A',
        steps: [{ event: 'ev [g,h]', reached: 'B' }],
        event: '',
        expect: '',
        reach: '',
        scenarios: [],
      },
    ];
    expect(testCasesToCsv(withComma).split('\n')[1]).toBe(
      '1,x-1S-001,A,"ev [g,h]",B,'
    );
  });

  it('HTML renders a <table> with the columnar headers', () => {
    const html = testCasesToHtml(positive);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>event_1</th>');
    expect(html).toContain('<th>scenarios</th>');
    expect(html).toContain('<td>watch-1S-001</td>');
  });

  it('HTML for an all-INV list uses the negative headers', () => {
    const html = testCasesToHtml(invalid);
    expect(html).toContain('<th>expect</th>');
    expect(html).toContain('<td>no-transition</td>');
  });
});

const scenarios: Scenario[] = [
  {
    id: 'watch-SC-001',
    scope: 'watch',
    start: 'Idle',
    steps: [
      { event: 'start', reached: 'Active' },
      { event: 'stop', reached: 'Idle' },
    ],
    covers: ['watch-1S-001', 'watch-1S-002'],
  },
];

describe('scenariosToCsv (SR-103 §6.2)', () => {
  it('columnar header ends with covers', () => {
    expect(scenariosToCsv(scenarios).split('\n')[0]).toBe(
      'seq,id,start,event_1,reached_1,event_2,reached_2,covers'
    );
  });

  it('row carries seq, walk steps, and ;-joined covers', () => {
    expect(scenariosToCsv(scenarios).split('\n')[1]).toBe(
      '1,watch-SC-001,Idle,start,Active,stop,Idle,watch-1S-001;watch-1S-002'
    );
  });

  it('HTML renders a <table>', () => {
    const html = scenariosToHtml(scenarios);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>covers</th>');
  });
});
