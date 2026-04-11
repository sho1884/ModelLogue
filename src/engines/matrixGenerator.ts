// Matrix generator: StateMachineModel → State×Event / PreState×PostState matrices
//
// The matrices use the hybrid pattern (per ADR-009): both composite states
// and their child states appear as rows. Composite rows hold group-escape
// transitions (transitions whose source is the composite itself) and child
// rows hold their own transitions. Children are listed directly under their
// parent and carry level = 1 for visual indentation.

import type { State, StateMachineModel, Transition } from '../types/stateMachine';
import type { MatrixData, MatrixRow } from '../types/matrix';

/**
 * Build the ordered list of rows for hybrid display.
 *
 * Order:
 *   - For each top-level composite state: the composite row first, then each
 *     of its child states in declaration order.
 *   - For each top-level normal state: the state row (with no indentation).
 *
 * Initial/final pseudo-states (both top-level and composite-internal) are
 * excluded from the matrix rows; they do not represent real states the
 * system can be in from a reviewer's perspective.
 */
function buildRows(model: StateMachineModel): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const childrenByParent = new Map<string, State[]>();

  for (const state of model.states) {
    if (state.parentId !== null) {
      const list = childrenByParent.get(state.parentId) ?? [];
      list.push(state);
      childrenByParent.set(state.parentId, list);
    }
  }

  const visible = (s: State): boolean =>
    s.type === 'normal' || s.type === 'composite';

  for (const state of model.states) {
    if (state.parentId !== null) continue; // handled under its parent
    if (!visible(state)) continue;

    rows.push({
      stateId: state.id,
      label: state.label,
      level: 0,
      isComposite: state.type === 'composite',
    });

    if (state.type === 'composite') {
      const children = childrenByParent.get(state.id) ?? [];
      for (const child of children) {
        if (!visible(child)) continue;
        rows.push({
          stateId: child.id,
          label: child.label,
          level: 1,
          isComposite: child.type === 'composite', // always false given one level
        });
      }
    }
  }

  return rows;
}

function formatTargetCell(
  matching: Transition[],
  model: StateMachineModel
): string {
  return matching
    .map((t) => {
      const target = model.states.find((s) => s.id === t.targetStateId);
      const targetLabel = target?.label ?? t.targetStateId;
      return t.guard ? `${targetLabel} [${t.guard}]` : targetLabel;
    })
    .join(', ');
}

/**
 * State×Event matrix with hybrid layout.
 *
 * Composite-state rows hold the transitions whose source is the composite
 * itself (group escape). Child rows hold the transitions whose source is
 * that specific child.
 */
export function generateStateEventMatrix(
  model: StateMachineModel
): MatrixData {
  const rows = buildRows(model);
  const columnHeaders = [...model.events];

  const cells: (string | null)[][] = rows.map((row) => {
    return columnHeaders.map((event) => {
      const matching = model.transitions.filter(
        (t) => t.sourceStateId === row.stateId && t.event === event
      );
      if (matching.length === 0) return null;
      return formatTargetCell(matching, model);
    });
  });

  return { rows, columnHeaders, cells };
}

/**
 * PreState×PostState matrix with hybrid layout.
 *
 * Both the row set and the column set follow the same hybrid ordering,
 * so composites appear in both axes alongside their children. Cells hold
 * the event name(s) for the direct transition between the source row and
 * the target column.
 */
export function generateStateStateMatrix(
  model: StateMachineModel
): MatrixData {
  const rows = buildRows(model);
  const columnHeaders = rows.map((r) => r.label);

  const cells: (string | null)[][] = rows.map((sourceRow) => {
    return rows.map((targetRow) => {
      const matching = model.transitions.filter(
        (t) =>
          t.sourceStateId === sourceRow.stateId &&
          t.targetStateId === targetRow.stateId
      );
      if (matching.length === 0) return null;
      return matching.map((t) => t.event ?? '(no event)').join(', ');
    });
  });

  return { rows, columnHeaders, cells };
}
