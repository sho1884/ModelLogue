// Events tab data (SR-121).
//
// Lists every task stereotyped as timer / message / error, together
// with which enumerated paths contain it. Used to surface
// exception-system trigger points during UAT review.

import type { ProcessModel, ProcessTask } from './model';
import { walkProcessNodes } from './model';
import { enumeratePaths } from './paths';

export type EventKind = 'timer' | 'message' | 'error';

export interface EventRow {
  taskId: string;
  taskLabel: string;
  lane: string;
  kind: EventKind;
  /** Source line where the event task appears. */
  line: number;
  /** Number of enumerated paths that include this task. */
  pathCount: number;
}

function isEventKind(s: string | null): s is EventKind {
  return s === 'timer' || s === 'message' || s === 'error';
}

export function collectEvents(model: ProcessModel): EventRow[] {
  const tasks: ProcessTask[] = [];
  walkProcessNodes(model.rootBody, (n) => {
    if (n.kind === 'task' && isEventKind(n.stereotype)) tasks.push(n);
  });
  if (tasks.length === 0) return [];

  // Enumerate once; count occurrences of each task's label across
  // resulting path rows. Reviewers mostly care about "how many
  // scenarios encounter this timer" which is the label-level count.
  const paths = enumeratePaths(model);
  return tasks.map((t) => ({
    taskId: t.id,
    taskLabel: t.label,
    lane: t.lane,
    kind: t.stereotype as EventKind,
    line: t.line,
    pathCount: paths.filter((r) => r.steps.includes(t.label)).length,
  }));
}

const CSV_HEADER = ['task', 'lane', 'event_kind', 'line', 'path_count'];

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function eventsToCsv(rows: EventRow[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [r.taskLabel, r.lane, r.kind, String(r.line), String(r.pathCount)]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function eventsToHtml(rows: EventRow[]): string {
  const head = `<thead><tr>${CSV_HEADER.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body =
    '<tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r.taskLabel}</td><td>${r.lane}</td><td>${r.kind}</td><td>${r.line}</td><td>${r.pathCount}</td></tr>`
      )
      .join('') +
    '</tbody>';
  return `<table border="1" cellspacing="0" cellpadding="4">${head}${body}</table>`;
}
