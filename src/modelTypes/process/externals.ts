// Externals tab data (SR-125).
//
// Aggregates `**外部:** name` / `**External:** name` annotations
// extracted from task notes into one row per distinct external IT
// system or repository, with the list of tasks that touch it.

import type { ProcessModel, ProcessTask } from './model';
import { walkProcessNodes } from './model';

export interface ExternalRow {
  name: string;
  /** Tasks with this external name in their externalReferences. */
  touchingTasks: string[];
}

export function collectExternals(model: ProcessModel): ExternalRow[] {
  const byName = new Map<string, Set<string>>();
  walkProcessNodes(model.rootBody, (node) => {
    if (node.kind !== 'task') return;
    const t = node as ProcessTask;
    for (const ext of t.externalReferences) {
      if (!byName.has(ext)) byName.set(ext, new Set());
      byName.get(ext)!.add(t.label);
    }
  });
  return [...byName.entries()].map(([name, tasks]) => ({
    name,
    touchingTasks: [...tasks],
  }));
}

const CSV_HEADER = ['external', 'touching_tasks'];

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function externalsToCsv(rows: ExternalRow[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([r.name, r.touchingTasks.join('; ')].map(csvCell).join(','));
  }
  return lines.join('\n');
}

export function externalsToHtml(rows: ExternalRow[]): string {
  const head = `<thead><tr>${CSV_HEADER.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
  const body =
    '<tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td>${r.name}</td><td>${r.touchingTasks.join('; ')}</td></tr>`
      )
      .join('') +
    '</tbody>';
  return `<table border="1" cellspacing="0" cellpadding="4">${head}${body}</table>`;
}
