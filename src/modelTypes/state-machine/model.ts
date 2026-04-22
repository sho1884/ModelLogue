// State machine model types
// Canonical representation parsed from PlantUML source.
//
// Composite states are supported with one level of nesting only (ADR-009).
// A State may be one of:
//   - 'normal'     : ordinary state
//   - 'composite'  : a state that contains child states (parentId of children)
//   - 'initial'    : pseudo-state for [*] as source
//   - 'final'      : pseudo-state for [*] as target

export type StateType = 'normal' | 'composite' | 'initial' | 'final';

export interface State {
  id: string;
  label: string;
  type: StateType;
  /**
   * Id of the enclosing composite state, or null for top-level states.
   * Only one level of nesting is permitted (ADR-009), so the parent is
   * always a top-level composite state.
   */
  parentId: string | null;
}

export interface Transition {
  sourceStateId: string;
  targetStateId: string;
  event: string | null;
  guard: string | null;
  action: string | null;
}

export interface StateMachineModel {
  states: State[];
  transitions: Transition[];
  events: string[]; // deduplicated
}
