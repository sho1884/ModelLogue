import { describe, it, expect } from 'vitest';
import {
  modelToRequirementsCsv,
  modelToRequirementsHtml,
} from '../../src/modelTypes/requirement/listSerializer';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('requirement list serializer (SR-113)', () => {
  it('CSV header matches §3.13.7', () => {
    const m = parse(`@startuml
$fReq("R1", "foo")
@enduml`).model!;
    const csv = modelToRequirementsCsv(m);
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'id,statement,type,text,contained_in,derives_from,hidden,deleted,note'
    );
  });

  it('emits type abbreviations in seed-form spelling', () => {
    const m = parse(`@startuml
$fReq("R1", "f")
$nfReq("R2", "nf")
$dConstraint("C1", "c")
$req("R3", "r")
@enduml`).model!;
    const csv = modelToRequirementsCsv(m);
    const rows = csv.split('\n').slice(1);
    expect(rows[0]).toContain(',functional,');
    expect(rows[1]).toContain(',nonfunctional,');
    expect(rows[2]).toContain(',constraint,');
    expect(rows[3]).toContain(',requirement,');
  });

  it('fills contained_in from parentId', () => {
    const m = parse(`@startuml
package "Group1" <<Frame>> {
  $fReq("R1", "foo")
}
$fReq("R2", "top")
@enduml`).model!;
    const csv = modelToRequirementsCsv(m);
    const r1 = csv.split('\n').find((l) => l.startsWith('R1,'))!;
    const r2 = csv.split('\n').find((l) => l.startsWith('R2,'))!;
    expect(r1).toContain(',Group1,');
    // R2 has no parent → empty column between text and derives_from
    expect(r2).toMatch(/^R2,top,functional,,,,,,/);
  });

  it('joins multiple derive sources with "; "', () => {
    const m = parse(`@startuml
$fReq("A", "a")
$fReq("B", "b")
$fReq("C", "c")
$derive("A", "C")
$derive("B", "C")
@enduml`).model!;
    const csv = modelToRequirementsCsv(m);
    const c = csv.split('\n').find((l) => l.startsWith('C,'))!;
    expect(c).toContain(',A; B,');
  });

  it('marks hidden/deleted and surfaces note', () => {
    const m = parse(`@startuml
$fReq("R1", "keep")
$fReq("R2", "parked")
' @modellogue hide "R2"
' @modellogue deleted "R3" "out of scope"
' $fReq("R3", "gone")
' @modellogue note "R1" "please review"
@enduml`).model!;
    const csv = modelToRequirementsCsv(m);
    const lines = csv.split('\n');
    const r1 = lines.find((l) => l.startsWith('R1,'))!;
    const r2 = lines.find((l) => l.startsWith('R2,'))!;
    const r3 = lines.find((l) => l.startsWith('R3,'))!;
    expect(r1).toContain(',please review');
    expect(r2).toMatch(/,Y,,/); // hidden=Y, deleted empty
    expect(r3).toMatch(/,,Y,out of scope/); // deleted=Y with reason
  });

  it('CSV with embedded commas gets RFC 4180 quoting', () => {
    const m = parse(`@startuml
$fReq("R1", "name with, comma")
@enduml`).model!;
    const csv = modelToRequirementsCsv(m);
    const row = csv.split('\n')[1];
    expect(row).toContain('"name with, comma"');
  });

  it('HTML output is a <table> with a row per requirement', () => {
    const m = parse(`@startuml
$fReq("R1", "foo")
$fReq("R2", "bar")
@enduml`).model!;
    const html = modelToRequirementsHtml(m);
    expect(html.startsWith('<table')).toBe(true);
    expect(html).toContain('<th>id</th>');
    expect(html).toContain(
      '<th scope="row" style="font-weight:normal;text-align:left;">R1</th>'
    );
    expect(html).toContain(
      '<th scope="row" style="font-weight:normal;text-align:left;">R2</th>'
    );
  });

  it('deleted rows carry a strikethrough style in HTML', () => {
    const m = parse(`@startuml
' @modellogue deleted "R1" "out"
' $fReq("R1", "gone")
@enduml`).model!;
    const html = modelToRequirementsHtml(m);
    expect(html).toContain('text-decoration:line-through');
  });
});
