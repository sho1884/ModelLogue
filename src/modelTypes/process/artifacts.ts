// Artifacts tab data (SR-123).
//
// Extracts every distinct arrow-label (`-> 伝票;`) from the process
// tree. Each row is an artifact name with (a) the task that produces
// it — whose outgoing edge carries the label — and (b) the tasks
// that consume it (tasks whose incomingLabel equals the name).

import type { ProcessModel, ProcessNode, ProcessTask } from './model';
import { walkProcessNodes } from './model';

/**
 * Find the first-reachable task(s) inside a body list. When a label
 * is attached to an `if` / `fork` / `partition` node (rather than a
 * leaf task), the consumer is the first task of each branch / body;
 * this helper walks in to find them.
 */
function firstTasksIn(body: ProcessNode[]): ProcessTask[] {
  for (const node of body) {
    if (node.kind === 'task') return [node];
    if (node.kind === 'if') {
      return [
        ...firstTasksIn(node.thenBranch),
        ...firstTasksIn(node.elseBranch),
      ];
    }
    if (node.kind === 'fork') {
      const out: ProcessTask[] = [];
      for (const branch of node.branches) out.push(...firstTasksIn(branch));
      return out;
    }
    if (node.kind === 'partition') {
      return firstTasksIn(node.body);
    }
    // start / stop / unknown — skip, try next sibling
  }
  return [];
}

export interface ArtifactRow {
  name: string;
  /** Tasks whose outgoing edge first carries this label. */
  producers: string[];
  /** Tasks whose incoming edge carries this label. */
  consumers: string[];
}

export function collectArtifacts(model: ProcessModel): ArtifactRow[] {
  // Flatten the tree into a linear sequence of "transition points"
  // so we can identify "previous task" relative to any node with an
  // incomingLabel. For fork / if with labels, the `previous` is the
  // last visible task before the branch; we don't try to be exact
  // across complex nesting — the artifact name and the consumer is
  // what reviewers read, the producer is a nice-to-have hint.

  // Producers: task whose next-sibling-in-source has this incomingLabel.
  // This is approximate across if/fork boundaries but matches the
  // intuition for the common linear case.
  interface Emission {
    node: ProcessNode;
    index: number;
  }
  const emissions: Emission[] = [];
  let idx = 0;
  walkProcessNodes(model.rootBody, (node) => {
    emissions.push({ node, index: idx++ });
  });

  const byName = new Map<string, ArtifactRow>();
  const row = (name: string): ArtifactRow => {
    let r = byName.get(name);
    if (!r) {
      r = { name, producers: [], consumers: [] };
      byName.set(name, r);
    }
    return r;
  };

  for (let i = 0; i < emissions.length; i++) {
    const e = emissions[i];
    const label = e.node.incomingLabel;
    if (!label) continue;

    // Consumer(s): if this node is a task, use it; otherwise recurse
    // into the container's body / branches to find the first task(s)
    // that will actually receive the labeled edge.
    const r = row(label);
    if (e.node.kind === 'task') {
      if (!r.consumers.includes(e.node.label)) r.consumers.push(e.node.label);
    } else {
      let consumers: ProcessTask[] = [];
      if (e.node.kind === 'if') {
        consumers = [
          ...firstTasksIn(e.node.thenBranch),
          ...firstTasksIn(e.node.elseBranch),
        ];
      } else if (e.node.kind === 'fork') {
        for (const branch of e.node.branches) {
          consumers.push(...firstTasksIn(branch));
        }
      } else if (e.node.kind === 'partition') {
        consumers = firstTasksIn(e.node.body);
      }
      for (const t of consumers) {
        if (!r.consumers.includes(t.label)) r.consumers.push(t.label);
      }
    }
    // Producer = nearest earlier task in the emission sequence.
    for (let j = i - 1; j >= 0; j--) {
      const prev = emissions[j].node;
      if (prev.kind === 'task') {
        if (!r.producers.includes((prev as ProcessTask).label)) {
          r.producers.push((prev as ProcessTask).label);
        }
        break;
      }
      if (prev.kind === 'start') {
        // The start "produces" nothing named, but we still register
        // the artifact with no producer. Leave producers empty.
        break;
      }
    }
  }

  return [...byName.values()];
}

const CSV_HEADER = ['artifact', 'producers', 'consumers'];

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function artifactsToCsv(rows: ArtifactRow[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [r.name, r.producers.join('; '), r.consumers.join('; ')]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function artifactsToHtml(rows: ArtifactRow[]): string {
  const head = `<thead><tr>${CSV_HEADER.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body =
    '<tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r.name}</td><td>${r.producers.join('; ')}</td><td>${r.consumers.join('; ')}</td></tr>`
      )
      .join('') +
    '</tbody>';
  return `<table border="1" cellspacing="0" cellpadding="4">${head}${body}</table>`;
}
