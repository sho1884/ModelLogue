// SR-090 (v7.1): pure model-level diff between two StateMachineModel values.
// Consumed by the ProposalView (SR-033) to drive add/remove/change overlays
// on the proposed diagram. No I/O, no UI knowledge.

import type {
  State,
  Transition,
  StateMachineModel,
} from '../types/stateMachine';

export interface StateChange {
  before: State;
  after: State;
}

export interface TransitionChange {
  before: Transition;
  after: Transition;
}

export interface ModelDiff {
  addedStates: State[];
  removedStates: State[];
  changedStates: StateChange[];
  addedTransitions: Transition[];
  removedTransitions: Transition[];
  changedTransitions: TransitionChange[];
}

function transitionKey(t: Transition): string {
  // Identity of a transition = (source, target, event). Changes in guard or
  // action against the same key count as a 'change'.
  return `${t.sourceStateId}\u0000${t.targetStateId}\u0000${t.event ?? ''}`;
}

function stateEquals(a: State, b: State): boolean {
  return (
    a.label === b.label && a.type === b.type && a.parentId === b.parentId
  );
}

function transitionEquals(a: Transition, b: Transition): boolean {
  return (
    a.sourceStateId === b.sourceStateId &&
    a.targetStateId === b.targetStateId &&
    a.event === b.event &&
    a.guard === b.guard &&
    a.action === b.action
  );
}

export function diffModels(
  before: StateMachineModel,
  after: StateMachineModel
): ModelDiff {
  const beforeStates = new Map(before.states.map((s) => [s.id, s]));
  const afterStates = new Map(after.states.map((s) => [s.id, s]));

  const addedStates: State[] = [];
  const removedStates: State[] = [];
  const changedStates: StateChange[] = [];

  for (const [id, afterState] of afterStates) {
    const beforeState = beforeStates.get(id);
    if (!beforeState) {
      addedStates.push(afterState);
    } else if (!stateEquals(beforeState, afterState)) {
      changedStates.push({ before: beforeState, after: afterState });
    }
  }
  for (const [id, beforeState] of beforeStates) {
    if (!afterStates.has(id)) {
      removedStates.push(beforeState);
    }
  }

  const beforeTx = new Map<string, Transition>();
  for (const t of before.transitions) beforeTx.set(transitionKey(t), t);
  const afterTx = new Map<string, Transition>();
  for (const t of after.transitions) afterTx.set(transitionKey(t), t);

  const addedTransitions: Transition[] = [];
  const removedTransitions: Transition[] = [];
  const changedTransitions: TransitionChange[] = [];

  for (const [key, a] of afterTx) {
    const b = beforeTx.get(key);
    if (!b) {
      addedTransitions.push(a);
    } else if (!transitionEquals(b, a)) {
      changedTransitions.push({ before: b, after: a });
    }
  }
  for (const [key, b] of beforeTx) {
    if (!afterTx.has(key)) {
      removedTransitions.push(b);
    }
  }

  return {
    addedStates,
    removedStates,
    changedStates,
    addedTransitions,
    removedTransitions,
    changedTransitions,
  };
}

export function isDiffEmpty(d: ModelDiff): boolean {
  return (
    d.addedStates.length === 0 &&
    d.removedStates.length === 0 &&
    d.changedStates.length === 0 &&
    d.addedTransitions.length === 0 &&
    d.removedTransitions.length === 0 &&
    d.changedTransitions.length === 0
  );
}
