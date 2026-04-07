// State machine model types
// Canonical representation parsed from PlantUML source

export type StateType = 'normal' | 'initial' | 'final';

export interface State {
  id: string;
  label: string;
  type: StateType;
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
