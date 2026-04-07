// Matrix generator: StateMachineModel → State×Event / PreState×PostState matrices

import type { StateMachineModel } from '../types/stateMachine';
import type { MatrixData } from '../types/matrix';

/**
 * Generate State×Event matrix
 * Rows: states (excluding initial/final pseudo-states)
 * Columns: events (deduplicated)
 * Cell: next state name(s), or null if no transition
 */
export function generateStateEventMatrix(
  model: StateMachineModel
): MatrixData {
  const normalStates = model.states.filter((s) => s.type === 'normal');
  const rowHeaders = normalStates.map((s) => s.label);
  const columnHeaders = [...model.events];

  const cells: (string | null)[][] = normalStates.map((state) => {
    return columnHeaders.map((event) => {
      const matching = model.transitions.filter(
        (t) => t.sourceStateId === state.id && t.event === event
      );
      if (matching.length === 0) return null;

      // Format: "NextState" or "NextState [guard1], NextState [guard2]"
      return matching
        .map((t) => {
          const target = model.states.find(
            (s) => s.id === t.targetStateId
          );
          const targetLabel = target?.label ?? t.targetStateId;
          if (t.guard) return `${targetLabel} [${t.guard}]`;
          return targetLabel;
        })
        .join(', ');
    });
  });

  return { rowHeaders, columnHeaders, cells };
}

/**
 * Generate PreState×PostState matrix
 * Rows: source states (excluding initial/final pseudo-states)
 * Columns: target states (excluding initial/final pseudo-states)
 * Cell: event name(s), or null if no direct transition
 */
export function generateStateStateMatrix(
  model: StateMachineModel
): MatrixData {
  const normalStates = model.states.filter((s) => s.type === 'normal');
  const rowHeaders = normalStates.map((s) => s.label);
  const columnHeaders = normalStates.map((s) => s.label);

  const cells: (string | null)[][] = normalStates.map((sourceState) => {
    return normalStates.map((targetState) => {
      const matching = model.transitions.filter(
        (t) =>
          t.sourceStateId === sourceState.id &&
          t.targetStateId === targetState.id
      );
      if (matching.length === 0) return null;

      return matching
        .map((t) => t.event ?? '(no event)')
        .join(', ');
    });
  });

  return { rowHeaders, columnHeaders, cells };
}
