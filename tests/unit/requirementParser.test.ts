import { describe, it, expect } from 'vitest';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('requirement parser (SR-110, v7.5)', () => {
  describe('macro DSL form', () => {
    it('parses $fReq / $nfReq / $dConstraint with type mapping', () => {
      const r = parse(`@startuml
$fReq("R1", "光を出す")
$nfReq("R2", "確実に光る")
$dConstraint("C1", "雨天でも使える")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model?.requirements).toHaveLength(3);
      expect(r.model?.requirements[0]).toMatchObject({
        id: 'R1',
        name: '光を出す',
        type: 'functionalRequirement',
      });
      expect(r.model?.requirements[1].type).toBe('nonFunctionalRequirement');
      expect(r.model?.requirements[2].type).toBe('designConstraint');
    });

    it('captures the optional text argument', () => {
      const r = parse(`@startuml
$fReq("R1", "電流を光に", "2.2V, 0.25A, TL球")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model?.requirements[0].text).toBe('2.2V, 0.25A, TL球');
    });

    it('parses relation macros with their kind', () => {
      const r = parse(`@startuml
$fReq("R1", "root")
$fReq("R11", "child")
$contain("R1", "R11")
$derive("R1", "R11")
$refine("R1", "R11")
$copy("R1", "R11")
@enduml`);
      expect(r.errors).toEqual([]);
      const kinds = r.model?.relations.map((x) => x.kind);
      expect(kinds).toEqual(['contain', 'derive', 'refine', 'copy']);
    });

    it('$contain sets the child parentId', () => {
      const r = parse(`@startuml
$fReq("P", "parent")
$fReq("C", "child")
$contain("P", "C")
@enduml`);
      expect(r.errors).toEqual([]);
      const child = r.model?.requirements.find((x) => x.id === 'C');
      expect(child?.parentId).toBe('P');
    });

    it('package block populates parentId for child requirements', () => {
      const r = parse(`@startuml
package "Group1" <<Frame>> {
  $fReq("R1", "first")
  $fReq("R2", "second")
}
$fReq("R3", "outside")
@enduml`);
      expect(r.errors).toEqual([]);
      const reqs = r.model!.requirements;
      expect(reqs.find((x) => x.id === 'R1')?.parentId).toBe('Group1');
      expect(reqs.find((x) => x.id === 'R2')?.parentId).toBe('Group1');
      expect(reqs.find((x) => x.id === 'R3')?.parentId).toBeNull();
    });
  });

  describe('meta macros (ADR-014)', () => {
    it('$hide sets hidden=true on the referenced requirement', () => {
      const r = parse(`@startuml
$fReq("R1", "foo")
$fReq("R2", "bar")
$hide("R2")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements.find((x) => x.id === 'R2')?.hidden).toBe(
        true
      );
      expect(r.model!.requirements.find((x) => x.id === 'R1')?.hidden).toBe(
        false
      );
    });

    it('$deleted sets deleted=true and stores the reason in note', () => {
      const r = parse(`@startuml
$fReq("R1", "foo")
$deleted("R1", "out of scope")
@enduml`);
      expect(r.errors).toEqual([]);
      const req = r.model!.requirements[0];
      expect(req.deleted).toBe(true);
      expect(req.note).toBe('out of scope');
    });

    it('$deleted with empty reason is rejected (ADR-014)', () => {
      const r = parse(`@startuml
$fReq("R1", "foo")
$deleted("R1", "")
@enduml`);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0].message).toMatch(/reason must be non-empty/);
    });

    it('$note attaches a free-form note', () => {
      const r = parse(`@startuml
$fReq("R1", "foo")
$note("R1", "needs clarification")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements[0].note).toBe('needs clarification');
    });

    it('meta macros referencing unknown ids are rejected', () => {
      const r = parse(`@startuml
$fReq("R1", "foo")
$hide("R99")
@enduml`);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0].message).toMatch(/unknown requirement id 'R99'/);
    });

    it('$note after $deleted appends to the note with a newline', () => {
      const r = parse(`@startuml
$fReq("R1", "foo")
$deleted("R1", "out of scope")
$note("R1", "see meeting notes 2026-05")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements[0].note).toBe(
        'out of scope\nsee meeting notes 2026-05'
      );
    });
  });

  describe('seed form', () => {
    it('parses requirement rows with id, name, type', () => {
      const r = parse(`@startuml
R1, 周囲を明るくする, functional
R11, 光を出す, functional
R11Q1, 光を確実に出す, nonfunctional
C1, 使用環境, constraint
@enduml`);
      expect(r.errors).toEqual([]);
      const reqs = r.model!.requirements;
      expect(reqs).toHaveLength(4);
      expect(reqs[0]).toMatchObject({
        id: 'R1',
        name: '周囲を明るくする',
        type: 'functionalRequirement',
      });
      expect(reqs[2].type).toBe('nonFunctionalRequirement');
      expect(reqs[3].type).toBe('designConstraint');
    });

    it('defaults missing type to functional', () => {
      const r = parse(`@startuml
R1, foo
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements[0].type).toBe('functionalRequirement');
    });

    it('parses optional text column, quoted when containing commas', () => {
      const r = parse(`@startuml
R1, foo, functional, "2.2V, 0.25A, TL球"
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements[0].text).toBe('2.2V, 0.25A, TL球');
    });

    it('reads hidden/deleted/note columns when present', () => {
      const r = parse(`@startuml
R1, foo, functional, , Y, ,
R2, bar, functional, , , Y, "out of scope"
@enduml`);
      expect(r.errors).toEqual([]);
      const [r1, r2] = r.model!.requirements;
      expect(r1.hidden).toBe(true);
      expect(r2.deleted).toBe(true);
      expect(r2.note).toBe('out of scope');
    });

    it('rejects deleted=Y seed row without a reason', () => {
      const r = parse(`@startuml
R1, foo, functional, , , Y, ""
@enduml`);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0].message).toMatch(/reason is required/);
    });

    it('parses derivation arrows (default kind = derive)', () => {
      const r = parse(`@startuml
R1, root
R11, child
R1 --> R11
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.relations).toEqual([
        { sourceId: 'R1', targetId: 'R11', kind: 'derive' },
      ]);
    });

    it('parses Containment arrow and sets parentId', () => {
      const r = parse(`@startuml
R1, root
R11, child
R1 --> R11: Containment
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.relations[0].kind).toBe('contain');
      const child = r.model!.requirements.find((x) => x.id === 'R11');
      expect(child?.parentId).toBe('R1');
    });

    it('rejects seed-form arrows with satisfy / verify / trace kinds (ADR-013)', () => {
      const r = parse(`@startuml
R1, root
D1, design
R1 --> D1: satisfy
@enduml`);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0].message).toMatch(/unsupported seed-form arrow kind/);
    });

    it('mixes macro and seed forms in one source', () => {
      const r = parse(`@startuml
$fReq("R1", "root")
R11, child, nonfunctional
R1 --> R11
$note("R11", "working memo")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements.map((x) => x.id)).toEqual(['R1', 'R11']);
      expect(r.model!.relations).toHaveLength(1);
      expect(r.model!.requirements[1].note).toBe('working memo');
    });
  });

  describe('preamble tolerance', () => {
    it('skips hide / title / skinparam / !theme / !include directives', () => {
      const r = parse(`@startuml
hide circle
hide empty members
skinparam backgroundColor #FFF
title My requirement model
!theme cerulean
$fReq("R1", "root")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements).toHaveLength(1);
    });

    it('swallows !procedure ... !endprocedure blocks', () => {
      const r = parse(`@startuml
!procedure $myMacro($id)
    class "$id" as $id
!endprocedure
$fReq("R1", "foo")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements).toHaveLength(1);
    });

    it('tolerates a realistic user-authored preamble + content mix', () => {
      const r = parse(`@startuml

hide circle
hide empty members
hide method

!procedure $fReq($id, $name)
    class "$name" as $id <<functionalRequirement>>
!endprocedure
!procedure $derive($Supplier, $Client)
    $Supplier <.. $Client : <<deriveReqt>>
!endprocedure

title 要求図のサンプル

package "ポケットライト" <<Frame>> {
    $fReq("R1", "周囲を明るくする")
    $fReq("R11", "光を出す")
}
$derive("R1", "R11")
@enduml`);
      expect(r.errors).toEqual([]);
      expect(r.model!.requirements).toHaveLength(2);
      expect(r.model!.requirements[0].parentId).toBe('ポケットライト');
      expect(r.model!.relations).toEqual([
        { sourceId: 'R1', targetId: 'R11', kind: 'derive' },
      ]);
    });
  });

  describe('error reporting', () => {
    it('rejects duplicate requirement ids', () => {
      const r = parse(`@startuml
$fReq("R1", "one")
$fReq("R1", "two")
@enduml`);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0].message).toMatch(/duplicate requirement id 'R1'/);
    });

    it('reports line numbers for unrecognized syntax', () => {
      const r = parse(`@startuml
$fReq("R1", "ok")
???garbage???
@enduml`);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].line).toBe(3);
    });

    it('detects an unclosed package', () => {
      const r = parse(`@startuml
package "Group1" <<Frame>> {
  $fReq("R1", "foo")
@enduml`);
      expect(r.errors.some((e) => /unclosed package/.test(e.message))).toBe(
        true
      );
    });
  });
});
