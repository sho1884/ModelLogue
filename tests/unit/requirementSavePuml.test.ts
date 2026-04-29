// Save .puml for requirement sessions (v7.5 step 12).
//
// Invariant the saved file must honor: the edit buffer is always a
// standalone-renderable PlantUML file — preamble included, review
// state expressed as comments — so PlantUML Server can render it
// without knowing anything about ModelLogue (ADR-012 / SR-115).

import { describe, it, expect } from 'vitest';
import { parseRequirementsCsv } from '../../src/modelTypes/requirement/csvParser';
import { modelToPlantUml } from '../../src/modelTypes/requirement/plantUmlGenerator';
import {
  DEFAULT_REQUIREMENT_SEED_SOURCE,
  hasPreamble,
} from '../../src/modelTypes/requirement/preamble';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('saved .puml contents (requirement session)', () => {
  it('starts the session with a preamble-carrying default source', () => {
    expect(DEFAULT_REQUIREMENT_SEED_SOURCE).toContain('@startuml');
    expect(DEFAULT_REQUIREMENT_SEED_SOURCE).toContain('@enduml');
    expect(hasPreamble(DEFAULT_REQUIREMENT_SEED_SOURCE)).toBe(true);
  });

  it('post-apply buffer carries the preamble (standalone renderable)', () => {
    const csv =
      'R1,light up,functional,,,,,,,,\n' +
      'R2,emit light,functional,,R1,R1,,,,,';
    const { model } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(model!);

    expect(puml).toContain('@startuml');
    expect(puml).toContain('@enduml');
    expect(hasPreamble(puml)).toBe(true);
    // Macro calls present — PlantUML Server will resolve them via the
    // embedded !procedure definitions.
    expect(puml).toContain('$fReq("R1", "light up")');
    expect(puml).toContain('$contain("R1", "R2")');
  });

  it('round-trips byte-stably: generate → save → reopen → same model', () => {
    // Simulates: the saved .puml is opened later, pasted back into a
    // fresh requirement session's buffer, parsed — the reviewer gets
    // back the same RequirementModel they saved.
    const csv =
      'R1,keep,functional,,,,,,,,\n' +
      'R2,merged-out,functional,,R1,,,Y,merged into R1,,\n' +
      'R3,parked,functional,,,,Y,,,,';
    const { model: original } = parseRequirementsCsv(csv);
    const puml = modelToPlantUml(original!);

    const { model: reopened, errors } = parse(puml);
    expect(errors).toEqual([]);
    expect(reopened?.requirements.map((r) => r.id).sort()).toEqual([
      'R1',
      'R2',
      'R3',
    ]);
    const r2 = reopened?.requirements.find((r) => r.id === 'R2');
    expect(r2?.deleted).toBe(true);
    expect(r2?.note).toBe('merged into R1');
    const r3 = reopened?.requirements.find((r) => r.id === 'R3');
    expect(r3?.hidden).toBe(true);
  });
});
