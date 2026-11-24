import { describe, it, expect } from 'vitest';
import { modelToCanonicalCsv } from '../../src/modelTypes/state-machine/transitionTableSerializer';
import { parse } from '../../src/modelTypes/state-machine/parser';
import type { StateMachineModel } from '../../src/modelTypes/state-machine/model';
import { EMPTY_CELL_DISPLAY } from '../../src/types/matrix';

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
  // §4.2.2. A forbidden (state, event) pair is MARKED, not left blank. The
  // .csv is not a private channel to the CLI: it gets opened in a spreadsheet
  // and read by a person, and a blank in a table body reads as "nobody filled
  // this in", which is the exact ambiguity SR-020 removes from the screen.
  // Writers emit one form (`-`); nswitch's reader additionally accepts empty,
  // `—`, `×`, `N/A` … for tables authored elsewhere.
  it('a forbidden (state, event) pair is marked `-`, never left blank (§4.2.2)', () => {
    const model = parseOrThrow(`@startuml
[*] --> Idle
Idle --> Running : go
Running --> Idle : stop
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const findRow = (id: string) =>
      csv.split('\r\n').find((l) => l.startsWith(`${id},`));
    // Idle has no `stop`; Running has no `go`. Both are negative-test targets.
    expect(findRow('Idle')).toBe('Idle,,,normal,Y,Running,-');
    expect(findRow('Running')).toBe('Running,,,normal,,-,Idle');
  });

  it('only the table body is marked — empty metadata columns keep meaning absence', () => {
    // §4.2.1: label empty ⇒ same as `state`; parent empty ⇒ top-level; initial
    // empty ⇒ not the layer's initial. Those blanks ARE the value, so a marker
    // there would be a lie (and would name a parent state "-").
    const model = parseOrThrow(`@startuml
[*] --> Idle
Idle --> Running : go
Running --> Idle : stop
@enduml`);
    const row = modelToCanonicalCsv(model)
      .split('\r\n')
      .find((l) => l.startsWith('Running,'))!;
    const [state, label, parent, type, initial] = row.split(',');
    expect(state).toBe('Running');
    expect(label).toBe(''); // label == id
    expect(parent).toBe(''); // top-level
    expect(type).toBe('normal');
    expect(initial).toBe(''); // not the initial target
  });

  it('the CSV marker and the on-screen marker are the same character', () => {
    // Not a coincidence: the requirement is that the same table reads the same
    // way on screen, pasted into Excel, and in the .csv. They are separate
    // constants (one is a wire format, one is a UI rule) so this pins them.
    const model = parseOrThrow(`@startuml
[*] --> Idle
Idle --> Running : go
Running --> Idle : stop
@enduml`);
    expect(modelToCanonicalCsv(model)).toContain(`,${EMPTY_CELL_DISPLAY}`);
  });

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
    expect(findRow('Idle')).toBe('Idle,待機,,normal,Y,Active,-,-,-');
    expect(findRow('Active')).toBe('Active,動作,,normal,,-,Idle,Failure,[*]');
    expect(findRow('Failure')).toBe('Failure,故障,,normal,,-,-,-,Idle');
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
    expect(findRow('Idle')).toBe('Idle,,,normal,Y,Operating,-,-,-');
    expect(findRow('Operating')).toBe('Operating,,,composite,,-,-,-,Idle');
    expect(findRow('Running')).toBe('Running,,Operating,normal,Y,-,Paused,-,-');
    expect(findRow('Paused')).toBe('Paused,,Operating,normal,,-,-,Running,-');
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
      'Idle,,,normal,Y,"Active [cnt>0] / log(""go"")",-'
    );
  });

  // §4.2.3: an initial transition may carry an action (never an event or
  // a guard), rendered in the `initial` column as `Y / action`.
  it('renders the action of an initial transition on the initial column', () => {
    const model = parseOrThrow(`@startuml
[*] --> Idle : / init()
Idle --> [*] : done
@enduml`);
    const csv = modelToCanonicalCsv(model);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('state,label,parent,type,initial,done');
    expect(lines[1]).toBe('Idle,,,normal,Y / init(),[*]');
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
