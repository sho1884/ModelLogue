// Tests for composite state support (ADR-009 + GT-020..GT-033)

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/parsers/stateMachineParser';

describe('Composite state parsing', () => {
  // GT-020
  it('parses a composite state with internal initial transition', () => {
    const source = `@startuml
state Operating {
  [*] --> Idle
  Idle --> Working : start
  Working --> Idle : stop
}
[*] --> Operating
@enduml`;

    const result = parse(source);
    expect(result.errors).toEqual([]);

    const model = result.model!;

    // The composite itself
    const operating = model.states.find((s) => s.id === 'Operating');
    expect(operating).toBeDefined();
    expect(operating!.type).toBe('composite');
    expect(operating!.parentId).toBeNull();

    // Child states
    const idle = model.states.find((s) => s.id === 'Idle');
    expect(idle).toBeDefined();
    expect(idle!.type).toBe('normal');
    expect(idle!.parentId).toBe('Operating');

    const working = model.states.find((s) => s.id === 'Working');
    expect(working).toBeDefined();
    expect(working!.type).toBe('normal');
    expect(working!.parentId).toBe('Operating');

    // Internal initial pseudo-state belongs to Operating
    const internalStart = model.states.find(
      (s) => s.id === '__start_of_Operating__'
    );
    expect(internalStart).toBeDefined();
    expect(internalStart!.type).toBe('initial');
    expect(internalStart!.parentId).toBe('Operating');

    // Transition count inside Operating: [*]->Idle, Idle->Working, Working->Idle
    const internalTransitions = model.transitions.filter((t) =>
      ['__start_of_Operating__', 'Idle', 'Working'].includes(t.sourceStateId)
    );
    expect(internalTransitions).toHaveLength(3);

    // Top-level initial points to Operating
    const topInit = model.transitions.find(
      (t) => t.sourceStateId === '[*]' && t.targetStateId === 'Operating'
    );
    expect(topInit).toBeDefined();
  });

  // GT-021
  it('recognizes composite-level transitions as group escape', () => {
    const source = `@startuml
state ReviewLoop {
  [*] --> Inspecting
  Inspecting --> Asking : ask
  Asking --> Inspecting : answered
}
[*] --> ReviewLoop
ReviewLoop --> Done : finished
Done --> [*]
@enduml`;

    const result = parse(source);
    expect(result.errors).toEqual([]);

    const model = result.model!;

    // Group escape transition
    const escape = model.transitions.find(
      (t) => t.sourceStateId === 'ReviewLoop' && t.targetStateId === 'Done'
    );
    expect(escape).toBeDefined();
    expect(escape!.event).toBe('finished');

    // Verify ReviewLoop is composite and children know their parent
    const reviewLoop = model.states.find((s) => s.id === 'ReviewLoop');
    expect(reviewLoop!.type).toBe('composite');

    const inspecting = model.states.find((s) => s.id === 'Inspecting');
    expect(inspecting!.parentId).toBe('ReviewLoop');
  });

  it('allows a composite with a Japanese display label', () => {
    const source = `@startuml
state "レビューループ" as ReviewLoop {
  [*] --> Inspecting
  Inspecting --> Asking : ask
}
@enduml`;

    const result = parse(source);
    expect(result.errors).toEqual([]);

    const reviewLoop = result.model!.states.find((s) => s.id === 'ReviewLoop');
    expect(reviewLoop).toBeDefined();
    expect(reviewLoop!.type).toBe('composite');
    expect(reviewLoop!.label).toBe('レビューループ');
  });

  it('allows --> [*] inside a composite (internal final)', () => {
    const source = `@startuml
state Phase1 {
  [*] --> A
  A --> B
  B --> [*]
}
@enduml`;

    const result = parse(source);
    expect(result.errors).toEqual([]);

    const internalEnd = result.model!.states.find(
      (s) => s.id === '__end_of_Phase1__'
    );
    expect(internalEnd).toBeDefined();
    expect(internalEnd!.type).toBe('final');
    expect(internalEnd!.parentId).toBe('Phase1');
  });

  it('keeps flat diagrams flat (no composite states)', () => {
    const source = `@startuml
[*] --> A
A --> B : go
B --> [*]
@enduml`;

    const result = parse(source);
    expect(result.errors).toEqual([]);

    const composites = result.model!.states.filter(
      (s) => s.type === 'composite'
    );
    expect(composites).toHaveLength(0);

    const states = result.model!.states.filter((s) => s.type === 'normal');
    for (const state of states) {
      expect(state.parentId).toBeNull();
    }
  });
});

describe('Composite state rejection (ADR-009)', () => {
  // GT-030
  it('rejects nested composite states', () => {
    const source = `@startuml
state Outer {
  state Inner {
    [*] --> A
  }
}
@enduml`;

    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/nested composite/i);
  });

  // GT-031
  it('rejects orthogonal regions', () => {
    const source = `@startuml
state Parallel {
  [*] --> A
  --
  [*] --> B
}
@enduml`;

    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /orthogonal/i.test(e.message))).toBe(
      true
    );
  });

  // GT-032
  it('rejects history pseudo-states', () => {
    const source = `@startuml
state Outer {
  [*] --> A
  A --> [H]
}
@enduml`;

    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /history/i.test(e.message))).toBe(true);
  });

  it('rejects deep history pseudo-states ([H*])', () => {
    const source = `@startuml
state Outer {
  [*] --> A
  A --> [H*]
}
@enduml`;

    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /history/i.test(e.message))).toBe(true);
  });

  // GT-033
  it('rejects dot-notation entry into a child', () => {
    const source = `@startuml
state Outer {
  [*] --> A
  A --> B
}
Somewhere --> Outer.B : event
@enduml`;

    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /dot-notation/i.test(e.message))).toBe(
      true
    );
  });

  it('reports an unclosed composite state', () => {
    const source = `@startuml
state Outer {
  [*] --> A
  A --> B
@enduml`;

    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /unclosed/i.test(e.message))).toBe(true);
  });
});
