import { describe, it, expect } from 'vitest';
import { parse } from '../../src/modelTypes/state-machine/parser';

describe('StateMachineParser', () => {
  // GT-001: Simple two-state machine
  it('parses simple state transitions', () => {
    const source = `
@startuml
[*] --> Idle
Idle --> Active : start
Active --> Idle : stop
Active --> [*]
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(0);
    expect(result.model).not.toBeNull();

    const model = result.model!;
    // Normal states: Idle, Active
    const normalStates = model.states.filter((s) => s.type === 'normal');
    expect(normalStates).toHaveLength(2);
    expect(normalStates.map((s) => s.id).sort()).toEqual(['Active', 'Idle']);

    // Events: start, stop
    expect(model.events.sort()).toEqual(['start', 'stop']);

    // 4 transitions (including initial and final)
    expect(model.transitions).toHaveLength(4);
  });

  // GT-002: Transitions with guards and actions
  it('parses transitions with event, guard, and action', () => {
    const source = `
@startuml
[*] --> Idle
Idle --> Processing : submit [valid] / validate()
Idle --> Error : submit [invalid] / showError()
Processing --> Done : complete / notify()
Error --> Idle : retry
Done --> [*]
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(0);

    const model = result.model!;
    const normalStates = model.states.filter((s) => s.type === 'normal');
    expect(normalStates.map((s) => s.id).sort()).toEqual([
      'Done',
      'Error',
      'Idle',
      'Processing',
    ]);
    expect(model.events.sort()).toEqual(['complete', 'retry', 'submit']);

    // Check guard and action on a specific transition
    const submitValid = model.transitions.find(
      (t) =>
        t.sourceStateId === 'Idle' &&
        t.targetStateId === 'Processing'
    );
    expect(submitValid).toBeDefined();
    expect(submitValid!.event).toBe('submit');
    expect(submitValid!.guard).toBe('valid');
    expect(submitValid!.action).toBe('validate()');
  });

  // GT-003: State aliases with Japanese names
  it('parses state aliases with Japanese labels', () => {
    const source = `
@startuml
state "待機中" as Idle
state "処理中" as Processing
state "完了" as Done
[*] --> Idle
Idle --> Processing : start
Processing --> Done : finish
Done --> [*]
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(0);

    const model = result.model!;
    const normalStates = model.states.filter((s) => s.type === 'normal');
    expect(normalStates).toHaveLength(3);

    const idle = normalStates.find((s) => s.id === 'Idle');
    expect(idle?.label).toBe('待機中');

    const processing = normalStates.find((s) => s.id === 'Processing');
    expect(processing?.label).toBe('処理中');

    const done = normalStates.find((s) => s.id === 'Done');
    expect(done?.label).toBe('完了');
  });

  it('handles initial and final pseudo-states correctly', () => {
    const source = `
@startuml
[*] --> A
A --> [*]
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(0);

    const model = result.model!;
    const initial = model.states.find((s) => s.type === 'initial');
    expect(initial).toBeDefined();

    const final = model.states.find((s) => s.type === 'final');
    expect(final).toBeDefined();
  });

  it('reports errors for unrecognized syntax', () => {
    const source = `
@startuml
[*] --> Idle
this is not valid syntax
Idle --> Active : go
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(4);
    expect(result.errors[0].message).toContain('Unrecognized syntax');

    // Model should still contain the valid parts
    expect(result.model).not.toBeNull();
    expect(result.model!.states.filter((s) => s.type === 'normal')).toHaveLength(2);
  });

  it('handles empty source gracefully', () => {
    const result = parse('');
    expect(result.errors).toHaveLength(0);
    expect(result.model).not.toBeNull();
    expect(result.model!.states).toHaveLength(0);
    expect(result.model!.transitions).toHaveLength(0);
  });

  it('handles source without @startuml/@enduml', () => {
    const source = `[*] --> Idle
Idle --> Active : go`;

    const result = parse(source);
    // Lines outside @startuml block are ignored
    expect(result.model!.states).toHaveLength(0);
  });

  it('parses transitions without events', () => {
    const source = `
@startuml
[*] --> Idle
Idle --> Active
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(0);

    const t = result.model!.transitions.find(
      (t) => t.sourceStateId === 'Idle' && t.targetStateId === 'Active'
    );
    expect(t).toBeDefined();
    expect(t!.event).toBeNull();
    expect(t!.guard).toBeNull();
    expect(t!.action).toBeNull();
  });

  it('skips comments', () => {
    const source = `
@startuml
' This is a comment
[*] --> Idle
# This is also a comment
Idle --> Active : go
@enduml`;

    const result = parse(source);
    expect(result.errors).toHaveLength(0);
    expect(result.model!.transitions).toHaveLength(2);
  });

  it('tolerates non-semantic PlantUML directives (hide / skinparam / theme / title etc.)', () => {
    const source = `
@startuml
hide empty description
skinparam state BackgroundColor #fafafa
!theme cerulean
title A stopwatch
left to right direction
scale 1.5

state "計測停止" as Off
state "計測中" as Active {
  state "通常表示" as Running
  state "ラップ表示" as LapDisplayed
  [*] --> Running
  Running --> LapDisplayed : LAP / ラップタイムを記録
  LapDisplayed --> Running : LAP / 現在時刻を表示
}
state "一時停止" as Paused

[*] --> Off
Off --> Active : START / 計測開始
Active --> Paused : START / 計測停止
Paused --> Active : START / 計測再開
Active --> Off : RESET / 計測をリセット
Paused --> Off : RESET / 計測をリセット
@enduml`;

    const result = parse(source);
    expect(result.errors).toEqual([]);
    expect(result.model).not.toBeNull();

    const model = result.model!;
    // "Active" is a composite; Running / LapDisplayed are inside it
    const composite = model.states.find((s) => s.id === 'Active');
    expect(composite?.type).toBe('composite');
    const normalChildren = model.states.filter(
      (s) => s.parentId === 'Active' && s.type === 'normal'
    );
    expect(normalChildren.map((s) => s.id).sort()).toEqual([
      'LapDisplayed',
      'Running',
    ]);
  });
});
