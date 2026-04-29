// SR-126 — cross-type parse diagnosis (Stage A).
//
// Verifies the discipline laid out in system_requirements.yaml:
//   - active 0-error → no suggestion
//   - near-empty source → no suggestion
//   - active fail + exactly one alternative parses cleanly with
//     non-trivial content → suggestion points at that alternative
//   - active fail + 0 alternatives clean → no suggestion
//   - active fail + >1 alternatives clean → no suggestion (ambiguous)

import { describe, it, expect } from 'vitest';
import { diagnoseAlternativeTypes } from '../../src/services/crossTypeDiagnosis';

describe('diagnoseAlternativeTypes (SR-126)', () => {
  it('returns null when active parse had no errors', () => {
    // active errorCount=0 → no diagnosis runs (regardless of source)
    const r = diagnoseAlternativeTypes('something', 'state-machine', 0);
    expect(r).toBeNull();
  });

  it('returns null for near-empty source even when active failed', () => {
    const r = diagnoseAlternativeTypes('@startuml', 'state-machine', 3);
    expect(r).toBeNull();
  });

  it('returns null when no alternative parses cleanly', () => {
    // Random text — neither state-machine nor requirement nor process
    // will accept this. Active reports errors, alternatives also error.
    const garbage = `This is not any valid PlantUML
random text without any DSL constructs
nothing parseable here at all`;
    const r = diagnoseAlternativeTypes(garbage, 'state-machine', 3);
    expect(r).toBeNull();
  });

  it('suggests `process` when state-machine fails on a process source', () => {
    const processSource = `@startuml
|顧客|
start
:申込書を提出;
:本人確認を行う;
if (本人確認 OK?) then (yes)
  :口座を開設する;
else (no)
  :申し込みを差し戻す;
endif
stop
@enduml`;
    // Active = state-machine; the process parser should accept this.
    const r = diagnoseAlternativeTypes(processSource, 'state-machine', 5);
    expect(r).not.toBeNull();
    expect(r!.suggestedTypeId).toBe('process');
    expect(r!.suggestedErrorCount).toBe(0);
    expect(r!.activeTypeId).toBe('state-machine');
    expect(r!.activeErrorCount).toBe(5);
  });

  it('suggests `state-machine` when process fails on a state-machine source', () => {
    const stateSource = `@startuml
[*] --> Idle
Idle --> Active : start
Active --> Idle : stop
Active --> Active : tick
@enduml`;
    const r = diagnoseAlternativeTypes(stateSource, 'process', 4);
    expect(r).not.toBeNull();
    expect(r!.suggestedTypeId).toBe('state-machine');
  });

  it('suggests `requirement` when state-machine fails on a requirement source', () => {
    // Macro-DSL form (no preamble needed for parsing — the parser
    // recognises macro calls directly).
    const reqSource = `@startuml
$fReq("R1", "light up the room")
$fReq("R2", "emit visible light")
$contain("R1", "R2")
@enduml`;
    const r = diagnoseAlternativeTypes(reqSource, 'state-machine', 6);
    expect(r).not.toBeNull();
    expect(r!.suggestedTypeId).toBe('requirement');
  });

  it('does not suggest when the active parser is also among types that "kind of" parse the source', () => {
    // A canonical state-machine source where state-machine is the
    // active type and produces 0 errors — no diagnosis should run.
    const stateSource = `@startuml
[*] --> Idle
Idle --> Active : start
@enduml`;
    const r = diagnoseAlternativeTypes(stateSource, 'state-machine', 0);
    expect(r).toBeNull();
  });
});
