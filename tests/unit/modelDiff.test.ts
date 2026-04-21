import { describe, it, expect } from 'vitest';
import { diffModels, isDiffEmpty } from '../../src/engines/modelDiff';
import type { StateMachineModel } from '../../src/types/stateMachine';

function model(
  states: StateMachineModel['states'],
  transitions: StateMachineModel['transitions']
): StateMachineModel {
  const events = Array.from(
    new Set(
      transitions.map((t) => t.event).filter((e): e is string => e !== null)
    )
  );
  return { states, transitions, events };
}

describe('modelDiff (SR-090)', () => {
  it('returns empty diff for identical models', () => {
    const m = model(
      [{ id: 'A', label: 'A', type: 'normal', parentId: null }],
      []
    );
    expect(isDiffEmpty(diffModels(m, m))).toBe(true);
  });

  it('detects an added state', () => {
    const before = model(
      [{ id: 'A', label: 'A', type: 'normal', parentId: null }],
      []
    );
    const after = model(
      [
        { id: 'A', label: 'A', type: 'normal', parentId: null },
        { id: 'B', label: 'B', type: 'normal', parentId: null },
      ],
      []
    );
    const d = diffModels(before, after);
    expect(d.addedStates).toHaveLength(1);
    expect(d.addedStates[0].id).toBe('B');
    expect(d.removedStates).toHaveLength(0);
  });

  it('detects a removed state', () => {
    const before = model(
      [
        { id: 'A', label: 'A', type: 'normal', parentId: null },
        { id: 'B', label: 'B', type: 'normal', parentId: null },
      ],
      []
    );
    const after = model(
      [{ id: 'A', label: 'A', type: 'normal', parentId: null }],
      []
    );
    const d = diffModels(before, after);
    expect(d.removedStates.map((s) => s.id)).toEqual(['B']);
  });

  it('detects a changed state when the label differs', () => {
    const before = model(
      [{ id: 'A', label: 'Old', type: 'normal', parentId: null }],
      []
    );
    const after = model(
      [{ id: 'A', label: 'New', type: 'normal', parentId: null }],
      []
    );
    const d = diffModels(before, after);
    expect(d.changedStates).toHaveLength(1);
    expect(d.changedStates[0].before.label).toBe('Old');
    expect(d.changedStates[0].after.label).toBe('New');
  });

  it('detects an added transition', () => {
    const states = [
      { id: 'A', label: 'A', type: 'normal' as const, parentId: null },
      { id: 'B', label: 'B', type: 'normal' as const, parentId: null },
    ];
    const before = model(states, []);
    const after = model(states, [
      {
        sourceStateId: 'A',
        targetStateId: 'B',
        event: 'go',
        guard: null,
        action: null,
      },
    ]);
    const d = diffModels(before, after);
    expect(d.addedTransitions).toHaveLength(1);
    expect(d.removedTransitions).toHaveLength(0);
  });

  it('treats same (source,target,event) with different guard as changed', () => {
    const states = [
      { id: 'A', label: 'A', type: 'normal' as const, parentId: null },
      { id: 'B', label: 'B', type: 'normal' as const, parentId: null },
    ];
    const before = model(states, [
      {
        sourceStateId: 'A',
        targetStateId: 'B',
        event: 'go',
        guard: 'x > 0',
        action: null,
      },
    ]);
    const after = model(states, [
      {
        sourceStateId: 'A',
        targetStateId: 'B',
        event: 'go',
        guard: 'x >= 0',
        action: null,
      },
    ]);
    const d = diffModels(before, after);
    expect(d.addedTransitions).toHaveLength(0);
    expect(d.removedTransitions).toHaveLength(0);
    expect(d.changedTransitions).toHaveLength(1);
    expect(d.changedTransitions[0].before.guard).toBe('x > 0');
    expect(d.changedTransitions[0].after.guard).toBe('x >= 0');
  });

  it('treats a renamed state id as remove+add (ids are the match key)', () => {
    const before = model(
      [{ id: 'A', label: 'A', type: 'normal', parentId: null }],
      []
    );
    const after = model(
      [{ id: 'A2', label: 'A', type: 'normal', parentId: null }],
      []
    );
    const d = diffModels(before, after);
    expect(d.removedStates.map((s) => s.id)).toEqual(['A']);
    expect(d.addedStates.map((s) => s.id)).toEqual(['A2']);
    expect(d.changedStates).toHaveLength(0);
  });
});
