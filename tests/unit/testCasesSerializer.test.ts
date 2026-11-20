import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  preconditionsCell,
  scenariosToCsv,
  scenariosToHtml,
  testCasesToCsv,
  testCasesToHtml,
} from '../../src/engines/testCasesSerializer';
import type { NswitchGenerationResult, Scenario, Test } from '../../src/types/testCase';

// Positive Tests (§6.1, columnar). Byte-equivalent to generate.py tests_to_csv.
const positive: Test[] = [
  {
    id: 'watch-1S-001',
    type: '1S',
    scope: 'watch',
    start: 'Active',
    steps: [
      { event: 'stop', guard: '', action: 'powerOff', reached: 'Idle' },
      { event: 'start', guard: 'ready', action: '', reached: 'Active' },
    ],
    event: '',
    expect: '',
    scenarios: ['watch-SC-001'],
  },
  {
    id: 'watch-1S-002',
    type: '1S',
    scope: 'watch',
    start: 'Idle',
    steps: [{ event: 'start', guard: 'ready', action: '', reached: 'Active' }],
    event: '',
    expect: '',
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
  it('positive Tests: (event, guard, action, reached) per step, padded to the longest chain', () => {
    const csv = testCasesToCsv(positive);
    expect(csv.split('\n')[0]).toBe(
      'seq,id,start,event_1,guard_1,action_1,reached_1,event_2,guard_2,action_2,reached_2,scenarios'
    );
  });

  it('positive Tests: rows carry seq, steps, and ;-joined scenarios (short rows padded)', () => {
    const rows = testCasesToCsv(positive).split('\n');
    expect(rows[1]).toBe(
      '1,watch-1S-001,Active,stop,,powerOff,Idle,start,ready,,Active,watch-SC-001'
    );
    // Shorter chain pads all four trailing step cells.
    expect(rows[2]).toBe(
      '2,watch-1S-002,Idle,start,ready,,Active,,,,,watch-SC-001;watch-SC-002'
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

  it('RFC 4180: quotes cells containing commas or quotes', () => {
    const withComma: Test[] = [
      {
        id: 'x-1S-001',
        type: '1S',
        scope: 'x',
        start: 'A',
        steps: [{ event: 'ev', guard: 'g, "h"', action: 'a, b', reached: 'B' }],
        event: '',
        expect: '',
        scenarios: [],
      },
    ];
    expect(testCasesToCsv(withComma).split('\n')[1]).toBe(
      '1,x-1S-001,A,ev,"g, ""h""","a, b",B,'
    );
  });

  it('HTML renders a <table> with the columnar headers', () => {
    const html = testCasesToHtml(positive);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>event_1</th>');
    expect(html).toContain('<th>guard_1</th>');
    expect(html).toContain('<th>action_1</th>');
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
      { event: 'start', guard: 'ready', action: '', reached: 'Active' },
      { event: 'stop', guard: '', action: 'powerOff', reached: 'Idle' },
    ],
    covers: ['watch-1S-001', 'watch-1S-002'],
    preconditions: [{ step: 1, guard: 'ready' }],
  },
];

describe('scenariosToCsv (SR-103 §6.2)', () => {
  it('columnar header ends with covers, preconditions', () => {
    expect(scenariosToCsv(scenarios).split('\n')[0]).toBe(
      'seq,id,start,event_1,guard_1,action_1,reached_1,event_2,guard_2,action_2,reached_2,covers,preconditions'
    );
  });

  it('row carries seq, walk steps, ;-joined covers and the preconditions', () => {
    expect(scenariosToCsv(scenarios).split('\n')[1]).toBe(
      '1,watch-SC-001,Idle,start,ready,,Active,stop,,powerOff,Idle,watch-1S-001;watch-1S-002,1:[ready]'
    );
  });

  it('preconditions cell: <step>:[<guard>] in step order, empty when none', () => {
    expect(
      preconditionsCell([
        { step: 2, guard: '期限内' },
        { step: 4, guard: '期限経過済' },
      ])
    ).toBe('2:[期限内];4:[期限経過済]');
    expect(preconditionsCell([])).toBe('');
    expect(preconditionsCell(undefined)).toBe('');
  });

  it('HTML renders a <table>', () => {
    const html = scenariosToHtml(scenarios);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>covers</th>');
    expect(html).toContain('<th>preconditions</th>');
    expect(html).toContain('<td>1:[ready]</td>');
  });
});

// ADR-011: the GUI's CSV must be byte-identical to the CLI's for the same
// result. The golden files are written by tools/nswitch (generate.py) from
// tests/golden/nswitch-library/model.puml; tools/nswitch/tests/test_golden.py
// checks the Python side against the same files.
describe('byte-equality with the nswitch CLI (golden: library loan, n=0)', () => {
  const dir = resolve(__dirname, '../golden/nswitch-library');
  const result = JSON.parse(
    readFileSync(resolve(dir, 'n0.result.json'), 'utf-8')
  ) as NswitchGenerationResult;

  it('Tests CSV', () => {
    expect(testCasesToCsv(result.tests)).toBe(
      readFileSync(resolve(dir, 'n0.tests.csv'), 'utf-8')
    );
  });

  it('Scenarios CSV (with preconditions)', () => {
    expect(scenariosToCsv(result.scenarios)).toBe(
      readFileSync(resolve(dir, 'n0.scenarios.csv'), 'utf-8')
    );
  });
});
