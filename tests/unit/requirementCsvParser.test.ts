import { describe, it, expect } from 'vitest';
import { parseRequirementsCsv } from '../../src/modelTypes/requirement/csvParser';

describe('parseRequirementsCsv (SR-113)', () => {
  it('skips the canonical 11-column header row', () => {
    const csv = `id,statement,type,text,contained_in,derives_from,hidden,deleted,note,level,group
R1,light up,functional,,,,,,,,`;
    const { model, errors } = parseRequirementsCsv(csv);
    expect(errors).toEqual([]);
    expect(model?.requirements).toHaveLength(1);
    expect(model?.requirements[0]).toMatchObject({
      id: 'R1',
      statement: 'light up',
      type: 'functionalRequirement',
      level: null,
      group: null,
    });
  });

  it('also accepts the legacy "name" header spelling', () => {
    const csv = `id,name,type,text,contained_in,derives_from,hidden,deleted,note,level,group
R1,light up,functional,,,,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[0].statement).toBe('light up');
  });

  it('populates parentId and a contain relation from contained_in', () => {
    const csv = `R1,top,functional,,,,,,,,
R11,child,functional,,R1,,,,,,`;
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
    const csv = `A,a,functional,,,,,,,,
B,b,functional,,,,,,,,
C,c,functional,,,A; B,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    const derives = model?.relations.filter((r) => r.kind === 'derive');
    expect(derives).toEqual([
      { sourceId: 'A', targetId: 'C', kind: 'derive' },
      { sourceId: 'B', targetId: 'C', kind: 'derive' },
    ]);
  });

  it('parses hidden=Y and deleted=Y', () => {
    const csv = `R1,keep,functional,,,,,,,,
R2,parked,functional,,,,Y,,,,
R3,gone,functional,,,,,Y,out of scope,,`;
    const { model, errors } = parseRequirementsCsv(csv);
    expect(errors).toEqual([]);
    expect(model?.requirements[1].hidden).toBe(true);
    expect(model?.requirements[2].deleted).toBe(true);
    expect(model?.requirements[2].note).toBe('out of scope');
  });

  it('errors when deleted=Y but note is empty (ADR-014)', () => {
    const csv = `R1,gone,functional,,,,,Y,,,`;
    const { errors } = parseRequirementsCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/deleted=Y but empty note/);
  });

  it('unknown type is an error', () => {
    const csv = `R1,x,bogus,,,,,,,,`;
    const { errors } = parseRequirementsCsv(csv);
    expect(errors[0].message).toMatch(/unknown type/);
  });

  it('handles RFC 4180 quoted commas in cells', () => {
    const csv = `R1,"has, comma",functional,,,,,,,,`;
    const { model } = parseRequirementsCsv(csv);
    expect(model?.requirements[0].statement).toBe('has, comma');
  });

  it('returns null model when input is empty', () => {
    expect(parseRequirementsCsv('').model).toBeNull();
    expect(parseRequirementsCsv('\n\n').model).toBeNull();
  });

  it('duplicate ids are flagged', () => {
    const csv = `R1,a,functional,,,,,,,,
R1,b,functional,,,,,,,,`;
    const { errors } = parseRequirementsCsv(csv);
    expect(errors[0].message).toMatch(/duplicate id/);
  });

  // ===== ADR-015 / SR-118: level + group columns =====

  describe('level (column 10) — closed value space', () => {
    it('parses user / system / design and yields the typed value', () => {
      const csv = `R1,a,functional,,,,,,,user,
R2,b,functional,,,,,,,system,
R3,c,functional,,,,,,,design,`;
      const { model, errors } = parseRequirementsCsv(csv);
      expect(errors).toEqual([]);
      expect(model?.requirements.map((r) => r.level)).toEqual([
        'user',
        'system',
        'design',
      ]);
    });

    it('treats empty level cell as null', () => {
      const csv = `R1,a,functional,,,,,,,,`;
      const { model } = parseRequirementsCsv(csv);
      expect(model?.requirements[0].level).toBeNull();
    });

    it('rejects unknown level values', () => {
      const csv = `R1,a,functional,,,,,,,bogus,`;
      const { errors } = parseRequirementsCsv(csv);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/unknown level/);
    });
  });

  describe('group (column 11) — free text', () => {
    it('passes the group string through verbatim', () => {
      const csv = `R1,a,functional,,,,,,,,Source editing
R2,b,functional,,,,,,,,AI chat`;
      const { model, errors } = parseRequirementsCsv(csv);
      expect(errors).toEqual([]);
      expect(model?.requirements.map((r) => r.group)).toEqual([
        'Source editing',
        'AI chat',
      ]);
    });

    it('treats empty group cell as null', () => {
      const csv = `R1,a,functional,,,,,,,,`;
      const { model } = parseRequirementsCsv(csv);
      expect(model?.requirements[0].group).toBeNull();
    });

    it('handles RFC 4180 quoted commas in group cell', () => {
      const csv = `R1,a,functional,,,,,,,,"Reviews, audits"`;
      const { model } = parseRequirementsCsv(csv);
      expect(model?.requirements[0].group).toBe('Reviews, audits');
    });
  });

  describe('strict 11-column form (ADR-015)', () => {
    it('rejects rows with fewer than 11 columns', () => {
      // 9-column legacy form
      const csv = `R1,a,functional,,,,,,`;
      const { errors } = parseRequirementsCsv(csv);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/9 columns; expected 11/);
    });

    it('rejects rows with more than 11 columns', () => {
      const csv = `R1,a,functional,,,,,,,,,extra`;
      const { errors } = parseRequirementsCsv(csv);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/12 columns; expected 11/);
    });

    it('rejects a header with the wrong column count', () => {
      const csv = `id,statement,type,text,contained_in,derives_from,hidden,deleted,note
R1,a,functional,,,,,,,,`;
      const { errors } = parseRequirementsCsv(csv);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toMatch(/header has 9 columns/);
    });
  });
});
