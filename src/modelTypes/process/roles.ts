// Roles tab data (SR-122).
//
// For each swim lane, list the tasks executed in it and the hand-off
// points — sequentially-adjacent tasks whose lanes differ, i.e. the
// places where the process relies on someone handing over control
// (and often an artifact) to someone else. Hand-offs are the highest-
// value review material for UAT / E2E test design because they mark
// the organisational boundaries each test has to coordinate across.

import type { ProcessModel, ProcessTask } from './model';
import { walkProcessNodes } from './model';

export interface HandOff {
  fromTask: string;
  toTask: string;
  fromLane: string;
  toLane: string;
  /** Arrow label (artifact) on the crossing edge, or null. */
  artifact: string | null;
}

export interface RoleRow {
  lane: string;
  tasks: string[];
  /** Hand-offs where this lane is the SOURCE (hands something over). */
  outgoingHandOffs: HandOff[];
  /** Hand-offs where this lane is the TARGET (receives). */
  incomingHandOffs: HandOff[];
}

export function collectRoles(model: ProcessModel): RoleRow[] {
  // Lane → task labels in source order.
  const tasksByLane = new Map<string, string[]>();

  // Flat sequence of tasks (in source order) for adjacent-pair hand-off
  // detection. Fork branches are flattened into the sequence — even
  // though branches run in parallel, "there exists a hand-off from
  // pre-fork task to first task in branch X" is still useful info.
  const sequence: ProcessTask[] = [];

  walkProcessNodes(model.rootBody, (n) => {
    if (n.kind === 'task') {
      if (!tasksByLane.has(n.lane)) tasksByLane.set(n.lane, []);
      tasksByLane.get(n.lane)!.push(n.label);
      sequence.push(n);
    }
  });

  const handOffs: HandOff[] = [];
  for (let i = 1; i < sequence.length; i++) {
    const prev = sequence[i - 1];
    const cur = sequence[i];
    if (prev.lane !== cur.lane) {
      handOffs.push({
        fromTask: prev.label,
        toTask: cur.label,
        fromLane: prev.lane,
        toLane: cur.lane,
        artifact: cur.incomingLabel ?? null,
      });
    }
  }

  // Build rows in the lane-declaration order the model carries; skip
  // lanes that never had a task (they may exist only as decoration).
  const rows: RoleRow[] = [];
  for (const lane of model.lanes) {
    const tasks = tasksByLane.get(lane) ?? [];
    if (tasks.length === 0) continue;
    rows.push({
      lane,
      tasks,
      outgoingHandOffs: handOffs.filter((h) => h.fromLane === lane),
      incomingHandOffs: handOffs.filter((h) => h.toLane === lane),
    });
  }
  // If any tasks were attributed to a lane not declared in model.lanes
  // (shouldn't happen post-parse, but be defensive), append them.
  for (const [lane, tasks] of tasksByLane) {
    if (!model.lanes.includes(lane)) {
      rows.push({
        lane,
        tasks,
        outgoingHandOffs: handOffs.filter((h) => h.fromLane === lane),
        incomingHandOffs: handOffs.filter((h) => h.toLane === lane),
      });
    }
  }
  return rows;
}

const CSV_HEADER = [
  'lane',
  'tasks',
  'outgoing_handoffs',
  'incoming_handoffs',
];

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatHandOff(h: HandOff, direction: 'out' | 'in'): string {
  const withArtifact = h.artifact ? ` [${h.artifact}]` : '';
  return direction === 'out'
    ? `${h.fromTask} → ${h.toTask}(${h.toLane})${withArtifact}`
    : `${h.fromTask}(${h.fromLane}) → ${h.toTask}${withArtifact}`;
}

export function rolesToCsv(rows: RoleRow[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.lane,
        r.tasks.join('; '),
        r.outgoingHandOffs.map((h) => formatHandOff(h, 'out')).join('; '),
        r.incomingHandOffs.map((h) => formatHandOff(h, 'in')).join('; '),
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function rolesToHtml(rows: RoleRow[]): string {
  const head = `<thead><tr>${CSV_HEADER.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body =
    '<tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r.lane}</td><td>${r.tasks.join('; ')}</td><td>${r.outgoingHandOffs.map((h) => formatHandOff(h, 'out')).join('; ')}</td><td>${r.incomingHandOffs.map((h) => formatHandOff(h, 'in')).join('; ')}</td></tr>`
      )
      .join('') +
    '</tbody>';
  return `<table border="1" cellspacing="0" cellpadding="4">${head}${body}</table>`;
}
