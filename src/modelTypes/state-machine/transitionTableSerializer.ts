// SR-101 (v7.3): serialize a StateMachineModel as the project-wide
// canonical state-transition-table CSV.
//
// The exact format is defined in
//   tools/nswitch/Requirements_Specification.md §4.2
// and is shared with the modellogue-nswitch CLI so artifacts round-trip
// between the GUI, the CLI, and version control.
//
// Header columns (fixed order, first five required):
//   state, label, parent, type, initial, <event1>, <event2>, ...
//
// Rows are emitted for states with type 'normal' or 'composite' only;
// the 'initial' and 'final' pseudo-states synthesized by the parser are
// folded into the `initial` column and the `[*]` cell value respectively.

import type { StateMachineModel, Transition } from './model';

function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatGuardAction(
  guard: string | null,
  action: string | null
): string {
  const g = guard ? ` [${guard}]` : '';
  const a = action ? ` / ${action}` : '';
  return g + a;
}

function formatInitialCell(t: Transition): string {
  return `Y${formatGuardAction(t.guard, t.action)}`;
}

function formatEventCell(target: string, t: Transition): string {
  return `${target}${formatGuardAction(t.guard, t.action)}`;
}

export function modelToCanonicalCsv(model: StateMachineModel): string {
  const stateById = new Map(model.states.map((s) => [s.id, s] as const));
  const finalIds = new Set(
    model.states.filter((s) => s.type === 'final').map((s) => s.id)
  );
  const initialIds = new Set(
    model.states.filter((s) => s.type === 'initial').map((s) => s.id)
  );

  // state id -> cell value for the `initial` column. We keep the first
  // observed transition if the source has multiple outgoing edges
  // (PlantUML semantics dictate at most one per layer; we do not synthesize
  // ambiguity when authors violate that).
  const initialCell = new Map<string, string>();
  for (const t of model.transitions) {
    if (!initialIds.has(t.sourceStateId)) continue;
    if (initialCell.has(t.targetStateId)) continue;
    initialCell.set(t.targetStateId, formatInitialCell(t));
  }

  // source state id -> event -> list of rendered cell values.
  // Multiple outgoing transitions on the same (state, event) are joined by '; '.
  const eventCells = new Map<string, Map<string, string[]>>();
  for (const t of model.transitions) {
    if (initialIds.has(t.sourceStateId)) continue; // folded into `initial` column
    if (t.event == null) continue; // regular transitions always carry an event
    const targetToken = finalIds.has(t.targetStateId)
      ? '[*]'
      : t.targetStateId;
    const perEvent =
      eventCells.get(t.sourceStateId) ?? new Map<string, string[]>();
    const list = perEvent.get(t.event) ?? [];
    list.push(formatEventCell(targetToken, t));
    perEvent.set(t.event, list);
    eventCells.set(t.sourceStateId, perEvent);
  }

  const header = ['state', 'label', 'parent', 'type', 'initial', ...model.events];
  const lines: string[] = [header.map(csvCell).join(',')];

  for (const s of model.states) {
    if (s.type !== 'normal' && s.type !== 'composite') continue;
    const label = stateById.get(s.id)?.label === s.id ? '' : s.label;
    const parent = s.parentId ?? '';
    const initial = initialCell.get(s.id) ?? '';
    const row = [s.id, label, parent, s.type, initial];
    const perEvent = eventCells.get(s.id);
    for (const ev of model.events) {
      const list = perEvent?.get(ev) ?? [];
      row.push(list.join('; '));
    }
    lines.push(row.map(csvCell).join(','));
  }

  return lines.join('\r\n');
}
