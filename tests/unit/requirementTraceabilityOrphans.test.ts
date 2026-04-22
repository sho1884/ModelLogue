import { describe, it, expect } from 'vitest';
import { buildTraceabilityMatrix } from '../../src/modelTypes/requirement/traceability';
import { findOrphans } from '../../src/modelTypes/requirement/orphans';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('traceability matrix (SR-111)', () => {
  it('excludes hidden and deleted requirements from the matrix', () => {
    const m = parse(`@startuml
$fReq("R1", "one")
$fReq("R2", "two")
$fReq("R3", "three")
$hide("R2")
$deleted("R3", "out")
@enduml`).model!;
    const mx = buildTraceabilityMatrix(m);
    expect(mx.ids).toEqual(['R1']);
  });

  it('marks derive / refine / copy cells with abbreviations', () => {
    const m = parse(`@startuml
$fReq("A", "a")
$fReq("B", "b")
$derive("A", "B")
$refine("A", "B")
$copy("A", "B")
@enduml`).model!;
    const mx = buildTraceabilityMatrix(m);
    expect(mx.cells['A']['B']).toEqual(expect.arrayContaining(['D', 'R', 'Cp']));
    expect(mx.cells['B']['A']).toEqual([]);
  });

  it('surfaces parent/child containment even without an explicit $contain', () => {
    const m = parse(`@startuml
package "Group1" <<Frame>> {
  $fReq("R1", "child")
}
$fReq("G", "req acting as parent")
$contain("G", "R1")
@enduml`).model!;
    const mx = buildTraceabilityMatrix(m);
    // parentId for R1 is now 'G' (overwritten by $contain); 'C' appears once.
    expect(mx.cells['G']['R1']).toEqual(['C']);
  });

  it('does not surface satisfy / verify / trace (ADR-013)', () => {
    const m = parse(`@startuml
$fReq("R1", "req")
$fReq("D1", "design")
$satisfy("R1", "D1")
@enduml`).model!;
    const mx = buildTraceabilityMatrix(m);
    expect(mx.cells['R1']['D1']).toEqual([]);
  });
});

describe('orphan analysis (SR-112)', () => {
  it('flags requirements with no incoming r-to-r relation', () => {
    const m = parse(`@startuml
$fReq("R1", "root")
$fReq("R2", "child")
$derive("R1", "R2")
@enduml`).model!;
    const o = findOrphans(m);
    expect(o.noIncoming.map((r) => r.id)).toEqual(['R1']);
  });

  it('flags requirements with no outgoing r-to-r relation', () => {
    const m = parse(`@startuml
$fReq("R1", "root")
$fReq("R2", "child")
$derive("R1", "R2")
@enduml`).model!;
    const o = findOrphans(m);
    expect(o.noOutgoing.map((r) => r.id)).toEqual(['R2']);
  });

  it('flags isolated requirements', () => {
    const m = parse(`@startuml
$fReq("R1", "root")
$fReq("R2", "child")
$fReq("R3", "lone")
$derive("R1", "R2")
@enduml`).model!;
    const o = findOrphans(m);
    expect(o.isolated.map((r) => r.id)).toEqual(['R3']);
  });

  it('treats parent-child containment as incoming trace', () => {
    const m = parse(`@startuml
$fReq("P", "parent")
$fReq("C", "child")
$contain("P", "C")
@enduml`).model!;
    const o = findOrphans(m);
    expect(o.noIncoming.map((r) => r.id)).toEqual(['P']);
    expect(o.noOutgoing.map((r) => r.id)).toEqual(['C']);
  });

  it('ignores hidden and deleted requirements', () => {
    const m = parse(`@startuml
$fReq("R1", "keep")
$fReq("R2", "hidden")
$fReq("R3", "gone")
$derive("R1", "R2")
$derive("R1", "R3")
$hide("R2")
$deleted("R3", "out")
@enduml`).model!;
    const o = findOrphans(m);
    // R1 is left alone (R2/R3 are filtered out of the analysis).
    expect(o.isolated.map((r) => r.id)).toEqual(['R1']);
  });

  it('ignores satisfy / verify / trace relations (ADR-013)', () => {
    const m = parse(`@startuml
$fReq("R1", "req")
$fReq("D1", "design")
$satisfy("R1", "D1")
@enduml`).model!;
    const o = findOrphans(m);
    // Despite the satisfy, R1 and D1 are both isolated for r-to-r purposes.
    expect(o.isolated.map((r) => r.id).sort()).toEqual(['D1', 'R1']);
  });
});
