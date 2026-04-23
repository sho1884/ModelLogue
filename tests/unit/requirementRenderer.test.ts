import { describe, it, expect } from 'vitest';
import { renderPlantUml } from '../../src/modelTypes/requirement/renderer';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('requirement renderer (SR-114, 2026-04-23 redesign)', () => {
  it('returns the source unchanged when nothing is hidden', () => {
    const src = `@startuml
$fReq("R1", "foo")
$fReq("R2", "bar")
$derive("R1", "R2")
@enduml`;
    const m = parse(src).model!;
    expect(renderPlantUml(src, m)).toBe(src);
  });

  it('returns the source unchanged when the model is null', () => {
    const src = `@startuml\n$fReq("R1", "foo")\n@enduml`;
    expect(renderPlantUml(src, null)).toBe(src);
  });

  it('comments out the declaration of a hidden requirement', () => {
    const src = `@startuml
$fReq("R1", "keep")
$fReq("R2", "hide me")
' @modellogue hide "R2"
@enduml`;
    const m = parse(src).model!;
    const out = renderPlantUml(src, m);
    // R1 stays as-is
    expect(out).toContain('$fReq("R1", "keep")');
    // R2 declaration is now commented
    expect(out).toContain(`' $fReq("R2", "hide me")`);
  });

  it('comments out relations that touch a hidden requirement', () => {
    const src = `@startuml
$fReq("R1", "keep")
$fReq("R2", "hide me")
$derive("R1", "R2")
$derive("R2", "R3")
' @modellogue hide "R2"
@enduml`;
    // R3 is undeclared but that's not the renderer's concern here.
    const m = parse(src).model!;
    const out = renderPlantUml(src, m);
    expect(out).toContain(`' $derive("R1", "R2")`);
    expect(out).toContain(`' $derive("R2", "R3")`);
  });

  it('does not re-comment a line already commented', () => {
    const src = `@startuml
$fReq("R1", "one")
' @modellogue deleted "R2" "out"
' $fReq("R2", "gone")
' @modellogue hide "R1"
@enduml`;
    const m = parse(src).model!;
    const out = renderPlantUml(src, m);
    // R2 line already starts with `'` — should NOT gain a second one.
    expect(out).not.toContain(`' ' $fReq("R2"`);
  });

  it('leaves delete blocks alone (they are already commented)', () => {
    const src = `@startuml
' @modellogue deleted "R1" "out"
' $fReq("R1", "gone")
@enduml`;
    const m = parse(src).model!;
    expect(renderPlantUml(src, m)).toBe(src);
  });

  it('is deterministic for the same input (ADR-011)', () => {
    const src = `@startuml
$fReq("R1", "a")
$fReq("R2", "b")
$derive("R1", "R2")
' @modellogue hide "R2"
@enduml`;
    const m1 = parse(src).model!;
    const m2 = parse(src).model!;
    expect(renderPlantUml(src, m1)).toBe(renderPlantUml(src, m2));
  });
});
