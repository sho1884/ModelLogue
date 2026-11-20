// SR-102 / SR-103: serialize the nswitch Tests and Scenarios for Copy / Save.
//
// CSV shapes match tools/nswitch/Requirements_Specification.md §6 (columnar):
//   - §6.1 Tests — positive: seq,id,start,(event_i,guard_i,action_i,reached_i)…,scenarios;
//                  INV:      seq,id,start,event,expect
//   - §6.2 Scenarios — seq,id,start,(event_i,guard_i,action_i,reached_i)…,covers,preconditions
// The emitters below mirror generate.py's tests_to_csv / scenarios_to_csv
// exactly, so files saved here are byte-identical to the CLI's stdout. That
// equivalence is the ADR-011 promise: same model + N + name always yields the
// same artifact regardless of which surface produced it.

import type { Precondition, Scenario, Step, Test } from '../types/testCase';

function csvCell(s: string | number): string {
  const text = String(s);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function htmlEscape(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maxSteps(items: { steps: unknown[] }[]): number {
  return items.reduce((m, x) => Math.max(m, x.steps.length), 0);
}

// The columnar header shared by positive Tests and Scenarios; `tail` is the
// cross-reference column (`scenarios` for Tests, `covers` for Scenarios).
function stepHeader(k: number, ...tail: string[]): string[] {
  const header = ['seq', 'id', 'start'];
  for (let i = 1; i <= k; i++) header.push(`event_${i}`, `guard_${i}`, `action_${i}`, `reached_${i}`);
  header.push(...tail);
  return header;
}

function stepCells(steps: Step[], k: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < k; i++) {
    const s = steps[i];
    if (s) cells.push(s.event, s.guard ?? '', s.action ?? '', s.reached);
    else cells.push('', '', '', '');
  }
  return cells;
}

// `<step>:[<guard>]`, semicolon-separated, in step order (§6.2).
export function preconditionsCell(pre: Precondition[] | undefined): string {
  return (pre ?? []).map((p) => `${p.step}:[${p.guard}]`).join(';');
}

// ---- Tests (§6.1) ----

const INV_HEADER = ['seq', 'id', 'start', 'event', 'expect'];

function testsAllInv(tests: Test[]): boolean {
  return tests.length > 0 && tests.every((t) => t.type === 'INV');
}

export function testCasesToCsv(tests: Test[]): string {
  const lines: string[] = [];
  if (testsAllInv(tests)) {
    lines.push(INV_HEADER.join(','));
    tests.forEach((t, i) => {
      lines.push([i + 1, t.id, t.start, t.event, t.expect].map(csvCell).join(','));
    });
    return lines.join('\n') + '\n';
  }
  const k = maxSteps(tests);
  lines.push(stepHeader(k, 'scenarios').map(csvCell).join(','));
  tests.forEach((t, i) => {
    const row = [i + 1, t.id, t.start, ...stepCells(t.steps, k), t.scenarios.join(';')];
    lines.push(row.map(csvCell).join(','));
  });
  return lines.join('\n') + '\n';
}

export function testCasesToHtml(tests: Test[]): string {
  const inv = testsAllInv(tests);
  const k = inv ? 0 : maxSteps(tests);
  const header = inv ? INV_HEADER : stepHeader(k, 'scenarios');
  const head =
    `<thead><tr>` +
    header.map((h) => `<th>${htmlEscape(h)}</th>`).join('') +
    `</tr></thead>`;
  const rows = tests.map((t, i) => {
    const cells = inv
      ? [i + 1, t.id, t.start, t.event, t.expect]
      : [i + 1, t.id, t.start, ...stepCells(t.steps, k), t.scenarios.join(';')];
    return `<tr>` + cells.map((c) => `<td>${htmlEscape(c)}</td>`).join('') + `</tr>`;
  });
  return (
    `<table border="1" cellspacing="0" cellpadding="4">` +
    head +
    `<tbody>${rows.join('')}</tbody>` +
    `</table>`
  );
}

// ---- Scenarios (§6.2) ----

export function scenariosToCsv(scenarios: Scenario[]): string {
  const k = maxSteps(scenarios);
  const lines: string[] = [stepHeader(k, 'covers', 'preconditions').map(csvCell).join(',')];
  scenarios.forEach((s, i) => {
    const row = [
      i + 1,
      s.id,
      s.start,
      ...stepCells(s.steps, k),
      s.covers.join(';'),
      preconditionsCell(s.preconditions),
    ];
    lines.push(row.map(csvCell).join(','));
  });
  return lines.join('\n') + '\n';
}

export function scenariosToHtml(scenarios: Scenario[]): string {
  const k = maxSteps(scenarios);
  const header = stepHeader(k, 'covers', 'preconditions');
  const head =
    `<thead><tr>` +
    header.map((h) => `<th>${htmlEscape(h)}</th>`).join('') +
    `</tr></thead>`;
  const rows = scenarios.map((s, i) => {
    const cells = [
      i + 1,
      s.id,
      s.start,
      ...stepCells(s.steps, k),
      s.covers.join(';'),
      preconditionsCell(s.preconditions),
    ];
    return `<tr>` + cells.map((c) => `<td>${htmlEscape(c)}</td>`).join('') + `</tr>`;
  });
  return (
    `<table border="1" cellspacing="0" cellpadding="4">` +
    head +
    `<tbody>${rows.join('')}</tbody>` +
    `</table>`
  );
}
