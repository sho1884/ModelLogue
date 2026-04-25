// Task-level diff between two ProcessModel snapshots (v7.6).
//
// Drives auto-marker placement after an AI apply: green rectangles
// on newly-added tasks, amber rectangles on changed tasks. Removed
// tasks get no marker (per the same rationale as SR-117 for
// requirements — the reviewer sees their disappearance on the
// redrawn diagram itself).
//
// Matching strategy: task label (first unmatched occurrence wins).
// Task ids are regenerated on every parse so they cannot be used
// across runs. If labels repeat, the first N on each side are paired
// by position, and the rest are treated as added / removed. This is
// a pragmatic choice for review-scale diagrams; renaming a task
// surfaces as remove-old + add-new, which reviewers are used to.

import type { ProcessModel, ProcessTask } from './model';
import { walkProcessNodes } from './model';

export interface TaskChange {
  before: ProcessTask;
  after: ProcessTask;
}

export interface ProcessDiff {
  added: ProcessTask[];
  removed: ProcessTask[];
  changed: TaskChange[];
}

function collectTasks(model: ProcessModel): ProcessTask[] {
  const out: ProcessTask[] = [];
  walkProcessNodes(model.rootBody, (n) => {
    if (n.kind === 'task') out.push(n);
  });
  return out;
}

function tasksEqual(a: ProcessTask, b: ProcessTask): boolean {
  if (a.label !== b.label) return false;
  if (a.lane !== b.lane) return false;
  if (a.stereotype !== b.stereotype) return false;
  if ((a.incomingLabel ?? '') !== (b.incomingLabel ?? '')) return false;
  const aExt = [...a.externalReferences].sort().join('|');
  const bExt = [...b.externalReferences].sort().join('|');
  if (aExt !== bExt) return false;
  return true;
}

export function diffProcessModels(
  before: ProcessModel,
  after: ProcessModel
): ProcessDiff {
  const beforeTasks = collectTasks(before);
  const afterTasks = collectTasks(after);

  // Group before tasks by label — FIFO queue per label — so we can
  // match after tasks to their earliest unmatched before twin.
  const beforeQueue = new Map<string, ProcessTask[]>();
  for (const t of beforeTasks) {
    if (!beforeQueue.has(t.label)) beforeQueue.set(t.label, []);
    beforeQueue.get(t.label)!.push(t);
  }

  const added: ProcessTask[] = [];
  const changed: TaskChange[] = [];
  const matchedBefore = new Set<ProcessTask>();

  for (const after of afterTasks) {
    const queue = beforeQueue.get(after.label);
    const twin = queue && queue.length > 0 ? queue.shift()! : null;
    if (!twin) {
      added.push(after);
      continue;
    }
    matchedBefore.add(twin);
    if (!tasksEqual(twin, after)) {
      changed.push({ before: twin, after });
    }
  }

  const removed: ProcessTask[] = [];
  for (const t of beforeTasks) {
    if (!matchedBefore.has(t)) removed.push(t);
  }

  return { added, removed, changed };
}

export function isProcessDiffEmpty(d: ProcessDiff): boolean {
  return (
    d.added.length === 0 &&
    d.removed.length === 0 &&
    d.changed.length === 0
  );
}
