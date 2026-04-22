import { describe, it, expect } from 'vitest';
import { modelToCanonicalCsv } from '../../src/engines/transitionTableSerializer';
import { parse } from '../../src/parsers/stateMachineParser';
import type { StateMachineModel } from '../../src/types/stateMachine';

function parseOrThrow(source: string): StateMachineModel {
  const { model, errors } = parse(source);
  if (errors.length > 0) {
    throw new Error(
      `Unexpected parse errors: ${errors.map((e) => `L${e.line}: ${e.message}`).join('; ')}`
    );
  }
  if (!model) throw new Error('Parser returned no model');
  return model;
}

describe('transitionTableSerializer (SR-101 v7.3)', () => {
  it('flat model: matches the §4.2.6 canonical example', () => {
    const model = parseOrThrow(`@startuml
[*] --> Idle
state "待機" as Idle
state "動作" as Active
state "故障" as Failure
Idle --> Active : start
Active --> Idle : stop
Active --> Failure : fault
Active --> [*] : reset
Failure --> Idle : reset
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'state,label,parent,type,initial,start,stop,fault,reset'
    );
    // Header row only; row order depends on parser discovery order. We
    // assert content by finding each row.
    const findRow = (id: string) =>
      lines.find((l) => l.startsWith(`${id},`));
    expect(findRow('Idle')).toBe('Idle,待機,,normal,Y,Active,,,');
    expect(findRow('Active')).toBe('Active,動作,,normal,,,Idle,Failure,[*]');
    expect(findRow('Failure')).toBe('Failure,故障,,normal,,,,,Idle');
  });

  it('composite model: matches the §4.2.7 canonical example (event order = discovery)', () => {
    const model = parseOrThrow(`@startuml
[*] --> Idle
Idle --> Operating : start
state Operating {
  [*] --> Running
  Running --> Paused : pause
  Paused --> Running : resume
}
Operating --> Idle : stop
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const lines = csv.split('\r\n');
    // Event column order follows parser discovery order, not §4.2.7's
    // illustrative order. Semantics are identical — column order is a
    // presentational choice that §4.2.5 pins only for the first five.
    expect(lines[0]).toBe(
      'state,label,parent,type,initial,start,pause,resume,stop'
    );
    const findRow = (id: string) =>
      lines.find((l) => l.startsWith(`${id},`));
    expect(findRow('Idle')).toBe('Idle,,,normal,Y,Operating,,,');
    expect(findRow('Operating')).toBe('Operating,,,composite,,,,,Idle');
    expect(findRow('Running')).toBe('Running,,Operating,normal,Y,,Paused,,');
    expect(findRow('Paused')).toBe('Paused,,Operating,normal,,,,Running,');
  });

  it('renders guards and actions in event cells', () => {
    const model = parseOrThrow(`@startuml
[*] --> Idle
Idle --> Active : start [cnt>0] / log("go")
Active --> [*] : done
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const idleRow = csv
      .split('\r\n')
      .find((l) => l.startsWith('Idle,'));
    expect(idleRow).toBe(
      'Idle,,,normal,Y,"Active [cnt>0] / log(""go"")",'
    );
  });

  // Forward compatibility: the CSV spec §4.2.3 allows `Y [g] / a` in the
  // `initial` column so that PlantUML's `[*] --> S : [g] / a` can round-
  // trip. The parser does not yet emit that variant (today it treats the
  // whole label as the event when the event part is empty), but when that
  // parser extension lands, the serializer is already format-ready — this
  // test locks in the cell format by feeding a hand-built model.
  it('renders guard and action on the initial column when a synthetic model carries them', () => {
    const model: StateMachineModel = {
      states: [
        { id: '[*]', label: '[*]', type: 'initial', parentId: null },
        { id: 'Idle', label: 'Idle', type: 'normal', parentId: null },
      ],
      transitions: [
        {
          sourceStateId: '[*]',
          targetStateId: 'Idle',
          event: null,
          guard: 'ready',
          action: 'init()',
        },
      ],
      events: [],
    };
    const csv = modelToCanonicalCsv(model);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('state,label,parent,type,initial');
    expect(lines[1]).toBe('Idle,,,normal,Y [ready] / init()');
  });

  it('joins multiple transitions on the same event with "; "', () => {
    const model = parseOrThrow(`@startuml
[*] --> A
A --> B : go [x]
A --> C : go [!x]
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const aRow = csv.split('\r\n').find((l) => l.startsWith('A,'));
    expect(aRow).toBe('A,,,normal,Y,B [x]; C [!x]');
  });

  it('omits label when label equals id', () => {
    const model = parseOrThrow(`@startuml
[*] --> A
A --> B : e
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const aRow = csv.split('\r\n').find((l) => l.startsWith('A,'));
    expect(aRow).toBe('A,,,normal,Y,B');
  });

  it('RFC 4180: quotes cells containing commas, quotes, or newlines', () => {
    const model = parseOrThrow(`@startuml
[*] --> A
A --> B : e / say("hi, there")
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const aRow = csv.split('\r\n').find((l) => l.startsWith('A,'));
    expect(aRow).toBe('A,,,normal,Y,"B / say(""hi, there"")"');
  });

  it('produces byte-identical output for repeated calls (determinism, ADR-011)', () => {
    const source = `@startuml
[*] --> Idle
Idle --> Active : start
Active --> Idle : stop
Active --> [*] : done
@enduml`;
    const m1 = parseOrThrow(source);
    const m2 = parseOrThrow(source);
    expect(modelToCanonicalCsv(m1)).toBe(modelToCanonicalCsv(m2));
  });
});
