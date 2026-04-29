import { describe, it, expect } from 'vitest';
import { parseRequirementsCsv } from '../../src/modelTypes/requirement/csvParser';
import {
  modelToPlantUml,
  type GroupingAxis,
} from '../../src/modelTypes/requirement/plantUmlGenerator';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('modelToPlantUml', () => {
  it('round-trips CSV → model → PlantUML → model (macro form, preamble included)', () => {
    const csv = `R1,light up,functional,,,,,,,,
R11,emit light,functional,,R1,R1,,,,,
Q1,reliable,nonfunctional,,,,,,,,
C1,outdoor,constraint,,,,,,,,`;
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
    const csv = `R1,keep,functional,,,,,,,,
R2,gone,functional,,,,,Y,out of scope,,`;
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
    const csv = `R1,keep,functional,,,,,,,,
R2,parked,functional,,,,Y,,,,`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain('\' @modellogue hide "R2"');
    const { model: reparsed } = parse(puml);
    expect(reparsed?.requirements.find((r) => r.id === 'R2')?.hidden).toBe(
      true
    );
  });

  it('note comment attaches to a non-deleted requirement', () => {
    const csv = `R1,keep,functional,,,,,,please review,,`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain('\' @modellogue note "R1" "please review"');
    const { model: reparsed } = parse(puml);
    expect(reparsed?.requirements[0].note).toBe('please review');
  });

  it('relations touching a deleted id are commented with deleted-side tag', () => {
    const csv = `R1,keep,functional,,,,,,,,
R2,gone,functional,,,R1,,Y,out of scope,,`;
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);
    expect(puml).toContain(
      '\' $derive("R1", "R2") \' @modellogue deleted-side "R2"'
    );
  });

  it('generation is deterministic (same model ⇒ byte-identical output)', () => {
    const csv = `R1,a,functional,,,,,,,,
R2,b,functional,,,R1,,,,,`;
    const { model: m1 } = parseRequirementsCsv(csv);
    const { model: m2 } = parseRequirementsCsv(csv);
    expect(modelToPlantUml(m1!)).toBe(modelToPlantUml(m2!));
  });

  it('quotes inside statement / text are escaped for PlantUML', () => {
    // RFC 4180 doubles embedded quotes; parseCsvRow resolves that to one ".
    const csv = `R1,"the ""bright"" mode",functional,,,,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[0].statement).toBe('the "bright" mode');
    const puml = modelToPlantUml(model!);
    // In PlantUML source the embedded " must be backslash-escaped to survive
    // the macro string argument.
    expect(puml).toContain('$fReq("R1", "the \\"bright\\" mode")');
  });

  // ===== ADR-015 / SR-119: groupingAxis =====

  describe('groupingAxis (ADR-015 / SR-119)', () => {
    it('emits flat output for the explicit `none` axis', () => {
      const csv = `R1,a,functional,,,,,,,user,
R2,b,functional,,,,,,,system,`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'none');
      expect(puml).not.toContain('package "');
      // No package → no layout directive either.
      expect(puml).not.toContain('left to right direction');
    });

    it('groups by `level` (cross-tier) and emits NO layout directive', () => {
      const csv = `UR-1,user req 1,requirement,,,,,,,user,
UR-2,user req 2,requirement,,,,,,,user,
SR-1,sys req 1,functional,,,UR-1,,,,system,
SR-2,sys req 2,functional,,,UR-2,,,,system,`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'level');
      // Cross-tier diagrams: the preamble's `.up.>` direction
      // modifier on derive arrows handles orientation. Adding a
      // global `left to right direction` directive here interferes
      // with `.up.>` for large derive-arrow sets and the supplier
      // ends up below the client instead of above. Skipping the
      // directive lets `.up.>` work cleanly.
      expect(puml).not.toContain('left to right direction');
      expect(puml).toContain('package "user" <<Frame>> {');
      expect(puml).toContain('package "system" <<Frame>> {');
      expect(puml).toContain('$derive("UR-1", "SR-1")');
      expect(puml).toContain('$derive("UR-2", "SR-2")');
    });

    it('groups by `group` (inventory) and DOES emit `left to right direction`', () => {
      const csv = `R1,a,functional,,,,,,,,Area1
R2,b,functional,,,,,,,,Area2`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'group');
      // Inventory-style diagrams have no cross-package arrows, so
      // they need the LR directive to stack packages vertically.
      expect(puml).toContain('left to right direction');
      expect(puml).toContain('package "Area1" <<Frame>> {');
      expect(puml).toContain('package "Area2" <<Frame>> {');
    });

    it('groups by `group` (free-text) and preserves first-appearance order', () => {
      const csv = `R1,a,functional,,,,,,,,B
R2,b,functional,,,,,,,,A
R3,c,functional,,,,,,,,B
R4,d,functional,,,,,,,,A`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'group');
      // Group "B" appears in row 1 and "A" appears first in row 2 →
      // first-appearance order is B before A.
      const idxB = puml.indexOf('package "B" <<Frame>>');
      const idxA = puml.indexOf('package "A" <<Frame>>');
      expect(idxB).toBeGreaterThan(0);
      expect(idxA).toBeGreaterThan(idxB);
    });

    it('groups by `type` (stereotype-driven layout)', () => {
      const csv = `R1,f,functional,,,,,,,,
R2,nf,nonfunctional,,,,,,,,
R3,c,constraint,,,,,,,,`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'type');
      expect(puml).toContain('package "functionalRequirement" <<Frame>> {');
      expect(puml).toContain('package "nonFunctionalRequirement" <<Frame>> {');
      expect(puml).toContain('package "designConstraint" <<Frame>> {');
    });

    it('falls back to flat output when the chosen axis has no values', () => {
      const csv = `R1,a,functional,,,,,,,,`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'level');
      // No level set on any row → no packages, no layout directive.
      expect(puml).not.toContain('package "');
      expect(puml).not.toContain('left to right direction');
    });

    it('mixes ungrouped (null axis) requirements with grouped ones', () => {
      const csv = `R1,a,functional,,,,,,,user,
R2,b,functional,,,,,,,,
R3,c,functional,,,,,,,system,`;
      const { model } = parseRequirementsCsv(csv);
      const puml = modelToPlantUml(model!, 'level');
      // R2 (level=null) sits at top level, before any package.
      const idxR2 = puml.indexOf('$fReq("R2"');
      const idxPkg = puml.indexOf('package "user"');
      expect(idxR2).toBeGreaterThan(0);
      expect(idxPkg).toBeGreaterThan(idxR2);
    });

    it('default axis selection: group > level > none', () => {
      // group present → use group
      const csvG = `R1,a,functional,,,,,,,,Area
R2,b,functional,,,,,,,user,Area2`;
      const pumlG = modelToPlantUml(parseRequirementsCsv(csvG).model!);
      expect(pumlG).toContain('package "Area" <<Frame>>');
      expect(pumlG).toContain('package "Area2" <<Frame>>');
      // level present, no group → use level
      const csvL = `R1,a,functional,,,,,,,user,
R2,b,functional,,,,,,,system,`;
      const pumlL = modelToPlantUml(parseRequirementsCsv(csvL).model!);
      expect(pumlL).toContain('package "user" <<Frame>>');
      expect(pumlL).toContain('package "system" <<Frame>>');
      // neither → flat
      const csvN = `R1,a,functional,,,,,,,,
R2,b,functional,,,,,,,,`;
      const pumlN = modelToPlantUml(parseRequirementsCsv(csvN).model!);
      expect(pumlN).not.toContain('package "');
    });
  });
});
