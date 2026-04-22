import { describe, it, expect } from 'vitest';
import { renderPlantUml } from '../../src/modelTypes/requirement/renderer';
import { parse } from '../../src/modelTypes/requirement/parser';
import { INJECTED_PREAMBLE } from '../../src/modelTypes/requirement/preamble';
import type { RequirementModel } from '../../src/modelTypes/requirement/model';

function parsed(source: string): RequirementModel {
  const r = parse(source);
  expect(r.errors).toEqual([]);
  return r.model!;
}

describe('requirement renderer (SR-114)', () => {
  it('emits @startuml / preamble / @enduml wrapping', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("R1", "foo")
@enduml`));
    expect(out.startsWith('@startuml')).toBe(true);
    expect(out.endsWith('@enduml')).toBe(true);
    expect(out).toContain(INJECTED_PREAMBLE);
  });

  it('quotes requirement arguments', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("R1", "光を出す")
@enduml`));
    expect(out).toContain('$fReq("R1", "光を出す")');
  });

  it('includes optional text when present', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("R1", "電流", "2.2V, 0.25A")
@enduml`));
    expect(out).toContain('$fReq("R1", "電流", "2.2V, 0.25A")');
  });

  it('emits derive / refine / copy relations', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("R1", "root")
$fReq("R11", "child")
$derive("R1", "R11")
$refine("R1", "R11")
$copy("R1", "R11")
@enduml`));
    expect(out).toContain('$derive("R1", "R11")');
    expect(out).toContain('$refine("R1", "R11")');
    expect(out).toContain('$copy("R1", "R11")');
  });

  it('wraps requirements with a free-form package parent in a package block', () => {
    const out = renderPlantUml(parsed(`@startuml
package "PocketLight" <<Frame>> {
  $fReq("R1", "first")
  $fReq("R2", "second")
}
@enduml`));
    expect(out).toContain('package "PocketLight" <<Frame>> {');
    expect(out).toMatch(/package "PocketLight"[\s\S]*\$fReq\("R1"[\s\S]*\}/);
  });

  it('encodes requirement-to-requirement parent via synthetic $contain', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("P", "parent")
$fReq("C", "child")
$contain("P", "C")
@enduml`));
    expect(out).toContain('$contain("P", "C")');
    // Both requirements declared at top level; not in a package
    expect(out).not.toContain('package "P"');
  });

  it('filters hidden requirements and their touching relations (SR-114)', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("R1", "keep")
$fReq("R2", "hide me")
$derive("R1", "R2")
$hide("R2")
@enduml`));
    expect(out).toContain('$fReq("R1"');
    expect(out).not.toContain('$fReq("R2"');
    expect(out).not.toContain('$derive("R1", "R2")');
  });

  it('filters deleted requirements and their touching relations', () => {
    const out = renderPlantUml(parsed(`@startuml
$fReq("R1", "keep")
$fReq("R2", "gone")
$derive("R1", "R2")
$deleted("R2", "out of scope")
@enduml`));
    expect(out).toContain('$fReq("R1"');
    expect(out).not.toContain('$fReq("R2"');
    expect(out).not.toContain('$derive("R1", "R2")');
  });

  it('is byte-deterministic for the same input (ADR-011)', () => {
    const m1 = parsed(`@startuml
$fReq("R1", "one")
$fReq("R2", "two")
$derive("R1", "R2")
@enduml`);
    const m2 = parsed(`@startuml
$fReq("R1", "one")
$fReq("R2", "two")
$derive("R1", "R2")
@enduml`);
    expect(renderPlantUml(m1)).toBe(renderPlantUml(m2));
  });
});
