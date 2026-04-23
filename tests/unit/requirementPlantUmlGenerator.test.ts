import { describe, it, expect } from 'vitest';
import { parseRequirementsCsv } from '../../src/modelTypes/requirement/csvParser';
import { modelToPlantUml } from '../../src/modelTypes/requirement/plantUmlGenerator';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('modelToPlantUml', () => {
  it('round-trips CSV → model → PlantUML → model (macro form, preamble included)', () => {
    const csv = `R1,light up,functional,,,,,,
R11,emit light,functional,,R1,R1,,,
Q1,reliable,nonfunctional,,,,,,
C1,outdoor,constraint,,,,,,`;
    const { model: fromCsv, errors: csvErrors } = parseRequirementsCsv(csv);
    expect(csvErrors).toEqual([]);
    const puml = modelToPlantUml(fromCsv!);
    expect(puml).toContain('@startuml');
    expect(puml).toContain('@enduml');
    expect(puml).toContain('!procedure $req');
    expect(puml).toContain('$fReq("R1", "light up")');
    expect(puml).toContain('$nfReq("Q1", "reliable")');
    expect(puml).toContain('$dConstraint("C1", "outdoor")');
    expect(puml).toContain('$contain("R1", "R11")');
    expect(puml).toContain('$derive("R1", "R11")');

    const { model: reparsed, errors } = parse(puml);
    expect(errors).toEqual([]);
    expect(reparsed?.requirements.map((r) => r.id)).toEqual([
      'R1',
      'R11',
      'Q1',
      'C1',
    ]);
    expect(reparsed?.requirements[0].statement).toBe('light up');
    expect(reparsed?.requirements[1].parentId).toBe('R1');
  });

  it('deleted rows become commented-out declarations with a deleted marker', () => {
    const csv = `R1,keep,functional,,,,,,
R2,gone,functional,,,,,Y,out of scope`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain('\' @modellogue deleted "R2" "out of scope"');
    expect(puml).toContain('\' $fReq("R2", "gone")');

    const { model: reparsed } = parse(puml);
    const r2 = reparsed?.requirements.find((r) => r.id === 'R2');
    expect(r2?.deleted).toBe(true);
    expect(r2?.note).toBe('out of scope');
  });

  it('hidden rows emit a hide comment at the bottom', () => {
    const csv = `R1,keep,functional,,,,,,
R2,parked,functional,,,,Y,,`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain('\' @modellogue hide "R2"');
    const { model: reparsed } = parse(puml);
    expect(reparsed?.requirements.find((r) => r.id === 'R2')?.hidden).toBe(
      true
    );
  });

  it('note comment attaches to a non-deleted requirement', () => {
    const csv = `R1,keep,functional,,,,,,please review`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain('\' @modellogue note "R1" "please review"');
    const { model: reparsed } = parse(puml);
    expect(reparsed?.requirements[0].note).toBe('please review');
  });

  it('relations touching a deleted id are commented with deleted-side tag', () => {
    const csv = `R1,keep,functional,,,,,,
R2,gone,functional,,,R1,,Y,out of scope`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain(
      '\' $derive("R1", "R2") \' @modellogue deleted-side "R2"'
    );
  });

  it('generation is deterministic (same model ⇒ byte-identical output)', () => {
    const csv = `R1,a,functional,,,,,,
R2,b,functional,,,R1,,,`;
    const { model: m1 } = parseRequirementsCsv(csv);
    const { model: m2 } = parseRequirementsCsv(csv);
    expect(modelToPlantUml(m1!)).toBe(modelToPlantUml(m2!));
  });

  it('quotes inside statement / text are escaped for PlantUML', () => {
    // RFC 4180 doubles embedded quotes; parseCsvRow resolves that to one ".
    const csv = `R1,"the ""bright"" mode",functional,,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[0].statement).toBe('the "bright" mode');
    const puml = modelToPlantUml(model!);
    // In PlantUML source the embedded " must be backslash-escaped to survive
    // the macro string argument.
    expect(puml).toContain('$fReq("R1", "the \\"bright\\" mode")');
  });
});
