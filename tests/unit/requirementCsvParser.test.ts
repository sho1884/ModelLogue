import { describe, it, expect } from 'vitest';
import { parseRequirementsCsv } from '../../src/modelTypes/requirement/csvParser';

describe('parseRequirementsCsv (SR-113)', () => {
  it('skips the canonical header row', () => {
    const csv = `id,statement,type,text,contained_in,derives_from,hidden,deleted,note
R1,light up,functional,,,,,,`;
    const { model, errors } = parseRequirementsCsv(csv);
    expect(errors).toEqual([]);
    expect(model?.requirements).toHaveLength(1);
    expect(model?.requirements[0]).toMatchObject({
      id: 'R1',
      statement: 'light up',
      type: 'functionalRequirement',
    });
  });

  it('also accepts the legacy "name" header spelling', () => {
    const csv = `id,name,type,text,contained_in,derives_from,hidden,deleted,note
R1,light up,functional,,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[0].statement).toBe('light up');
  });

  it('populates parentId and a contain relation from contained_in', () => {
    const csv = `R1,top,functional,,,,,,
R11,child,functional,,R1,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[1]).toMatchObject({
      id: 'R11',
      parentId: 'R1',
    });
    expect(model?.relations).toContainEqual({
      sourceId: 'R1',
      targetId: 'R11',
      kind: 'contain',
    });
  });

  it('splits derives_from on ";" and emits one derive per source', () => {
    const csv = `A,a,functional,,,,,,
B,b,functional,,,,,,
C,c,functional,,,A; B,,,`;
    const { model } = parseRequirementsCsv(csv);
    const derives = model?.relations.filter((r) => r.kind === 'derive');
    expect(derives).toEqual([
      { sourceId: 'A', targetId: 'C', kind: 'derive' },
      { sourceId: 'B', targetId: 'C', kind: 'derive' },
    ]);
  });

  it('parses hidden=Y and deleted=Y', () => {
    const csv = `R1,keep,functional,,,,,,
R2,parked,functional,,,,Y,,
R3,gone,functional,,,,,Y,out of scope`;
    const { model, errors } = parseRequirementsCsv(csv);
    expect(errors).toEqual([]);
    expect(model?.requirements[1].hidden).toBe(true);
    expect(model?.requirements[2].deleted).toBe(true);
    expect(model?.requirements[2].note).toBe('out of scope');
  });

  it('errors when deleted=Y but note is empty (ADR-014)', () => {
    const csv = `R1,gone,functional,,,,,Y,`;
    const { errors } = parseRequirementsCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/deleted=Y but empty note/);
  });

  it('unknown type is an error', () => {
    const csv = `R1,x,bogus,,,,,,`;
    const { errors } = parseRequirementsCsv(csv);
    expect(errors[0].message).toMatch(/unknown type/);
  });

  it('handles RFC 4180 quoted commas in cells', () => {
    const csv = `R1,"has, comma",functional,,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[0].statement).toBe('has, comma');
  });

  it('returns null model when input is empty', () => {
    expect(parseRequirementsCsv('').model).toBeNull();
    expect(parseRequirementsCsv('\n\n').model).toBeNull();
  });

  it('duplicate ids are flagged', () => {
    const csv = `R1,a,functional,,,,,,
R1,b,functional,,,,,,`;
    const { errors } = parseRequirementsCsv(csv);
    expect(errors[0].message).toMatch(/duplicate id/);
  });
});
