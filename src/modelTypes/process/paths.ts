// Path enumeration for the process-diagram Scenarios tab (SR-120).
//
// Walks the ProcessModel tree and emits one PathRow per distinct
// start → stop route. If/else branches multiply: each `if` doubles
// the number of in-progress paths (one following then, one
// following else). Fork regions do NOT multiply — per SR-120 they
// contribute a single fork token to the path; tasks inside fork
// branches are aggregated into the same row because all branches
// must execute (we just don't model their interleaving).
//
// Each PathRow carries everything a reviewer needs for UAT / E2E
// test case design: task order, branch choices, lanes traversed,
// events encountered, artifacts (arrow labels), and external IT
// system / repository references touched.

import type { ProcessModel, ProcessNode } from './model';
import { walkProcessNodes } from './model';

export interface PathRow {
  /** Display id — "P1", "P2", ... */
  id: string;
  /** Ordered task labels (tasks in fork branches aggregated in source order, prefixed `‖`). */
  steps: string[];
  /** Branch choices taken, e.g. ["承認できる? yes", "金額>100万円? no"]. */
  branches: string[];
  /** Lanes traversed on this path, first-seen order. */
  lanes: string[];
  /** Event stereotypes encountered (may repeat), e.g. ["timer", "message"]. */
  events: string[];
  /** Arrow-label artifacts along the path, in order. */
  artifacts: string[];
  /** Unique external IT systems / repositories touched on this path. */
  externals: string[];
}

// ===== Internal building-path shape =====

interface Building {
  steps: string[];
  branches: string[];
  lanes: string[];
  events: string[];
  artifacts: string[];
  externals: Set<string>;
}

function cloneBuilding(p: Building): Building {
  return {
    steps: [...p.steps],
    branches: [...p.branches],
    lanes: [...p.lanes],
    events: [...p.events],
    artifacts: [...p.artifacts],
    externals: new Set(p.externals),
  };
}

function addLane(p: Building, lane: string): void {
  if (!p.lanes.includes(lane)) p.lanes.push(lane);
}

function isEventStereotype(s: string | null): s is string {
  return s === 'timer' || s === 'message' || s === 'error';
}

// Inline a node's effects into a single path (used for node kinds that
// don't branch: start, stop, task, partition body, fork branch body).
function inlineInto(p: Building, node: ProcessNode): void {
  if (node.incomingLabel) p.artifacts.push(node.incomingLabel);
  switch (node.kind) {
    case 'start':
      addLane(p, node.lane);
      break;
    case 'stop':
      addLane(p, node.lane);
      break;
    case 'task':
      addLane(p, node.lane);
      p.steps.push(node.label);
      if (isEventStereotype(node.stereotype)) {
        p.events.push(node.stereotype);
      }
      for (const ext of node.externalReferences) {
        p.externals.add(ext);
      }
      break;
    case 'partition':
      for (const child of node.body) inlineInto(p, child);
      break;
    case 'fork':
      // A fork contributes a single token. All branch tasks are
      // aggregated (they all occur; order-between-branches is not
      // modelled). Inner if / partition are recursed into inline —
      // if a fork branch itself contains an if, we DO NOT split
      // paths here (that would re-introduce the exponential
      // enumeration SR-120 forbids). Instead we inline all sides.
      p.steps.push(`‖ fork(${node.branches.length})`);
      for (const branch of node.branches) {
        for (const child of branch) inlineInto(p, child);
      }
      break;
    case 'if':
      // Defensive: should be handled by visitBody above. If we get
      // here via a nested fork → if, inline both branches without
      // multiplying paths.
      for (const child of node.thenBranch) inlineInto(p, child);
      for (const child of node.elseBranch) inlineInto(p, child);
      break;
  }
}

function visitBody(body: ProcessNode[], inPaths: Building[]): Building[] {
  let paths = inPaths;
  for (const node of body) {
    if (node.kind === 'if') {
      // Use ":" separator (not "?") because the condition often already
      // ends in "?" — we'd double-mark otherwise.
      const branchLabel = (taken: string) =>
        `${node.condition}: ${taken}`;
      const thenSeeds = paths.map(cloneBuilding);
      const elseSeeds = paths.map(cloneBuilding);
      for (const p of thenSeeds) p.branches.push(branchLabel(node.thenLabel));
      for (const p of elseSeeds) p.branches.push(branchLabel(node.elseLabel));
      if (node.incomingLabel) {
        for (const p of thenSeeds) p.artifacts.push(node.incomingLabel);
        for (const p of elseSeeds) p.artifacts.push(node.incomingLabel);
      }
      const thenResult = visitBody(node.thenBranch, thenSeeds);
      const elseResult = visitBody(node.elseBranch, elseSeeds);
      paths = [...thenResult, ...elseResult];
    } else if (node.kind === 'partition') {
      // Partition: transparent to path structure; recurse on its body.
      paths = visitBody(node.body, paths);
    } else {
      // start / stop / task / fork — no path multiplication.
      for (const p of paths) inlineInto(p, node);
    }
  }
  return paths;
}

export function enumeratePaths(model: ProcessModel): PathRow[] {
  const initial: Building = {
    steps: [],
    branches: [],
    lanes: [],
    events: [],
    artifacts: [],
    externals: new Set(),
  };
  const raw = visitBody(model.rootBody, [initial]);
  return raw.map((b, idx) => ({
    id: `P${idx + 1}`,
    steps: b.steps,
    branches: b.branches,
    lanes: b.lanes,
    events: b.events,
    artifacts: b.artifacts,
    externals: [...b.externals],
  }));
}

// ===== CSV emission =====

const CSV_HEADER = [
  'path_id',
  'steps',
  'branches_taken',
  'lanes',
  'events',
  'artifacts',
  'externals_touched',
];

function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function pathsToCsv(rows: PathRow[]): string {
  const lines: string[] = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.steps.join('; '),
        r.branches.join('; '),
        r.lanes.join('; '),
        r.events.join('; '),
        r.artifacts.join('; '),
        r.externals.join('; '),
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function pathsToHtml(rows: PathRow[]): string {
  const header =
    '<thead><tr>' +
    CSV_HEADER.map((h) => `<th>${h}</th>`).join('') +
    '</tr></thead>';
  const body =
    '<tbody>' +
    rows
      .map(
        (r) =>
          '<tr>' +
          `<td>${r.id}</td>` +
          `<td>${r.steps.join('; ')}</td>` +
          `<td>${r.branches.join('; ')}</td>` +
          `<td>${r.lanes.join('; ')}</td>` +
          `<td>${r.events.join('; ')}</td>` +
          `<td>${r.artifacts.join('; ')}</td>` +
          `<td>${r.externals.join('; ')}</td>` +
          '</tr>'
      )
      .join('') +
    '</tbody>';
  return `<table border="1" cellspacing="0" cellpadding="4">${header}${body}</table>`;
}

// ===== Helper used by downstream tabs (e.g. Events "path count") =====

/**
 * Count how many enumerated paths contain the given node id.
 * Cheap enough for v7.6 review-scale diagrams (~40 tasks × ~tens of
 * paths) to compute on each render.
 */
export function countPathsContainingTask(
  model: ProcessModel,
  taskId: string,
  taskLabel: string
): number {
  // Identify the task by its label (path rows carry labels, not ids).
  // If labels are not unique, this over-counts — which is fine for
  // v7.6's "touched by N scenarios" display purpose.
  void taskId;
  const rows = enumeratePaths(model);
  return rows.filter((r) => r.steps.includes(taskLabel)).length;
}

// Re-export the walker for convenience (several tabs use it directly).
export { walkProcessNodes };
