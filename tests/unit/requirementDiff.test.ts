import { describe, it, expect } from 'vitest';
import {
  diffRequirementModelsVisible,
  isDiffEmpty,
} from '../../src/modelTypes/requirement/diff';
import type { RequirementModel } from '../../src/modelTypes/requirement/model';

function req(
  id: string,
  statement: string,
  overrides: Partial<{
    text: string | null;
    type: 'requirement' | 'functionalRequirement' | 'nonFunctionalRequirement' | 'designConstraint';
    parentId: string | null;
    hidden: boolean;
    deleted: boolean;
    note: string;
  }> = {}
) {
  return {
    id,
    statement,
    text: overrides.text ?? null,
    type: overrides.type ?? 'functionalRequirement',
    parentId: overrides.parentId ?? null,
    hidden: overrides.hidden ?? false,
    deleted: overrides.deleted ?? false,
    note: overrides.note ?? '',
  };
}

function model(
  reqs: ReturnType<typeof req>[],
  rels: { kind: 'derive' | 'contain' | 'refine' | 'satisfy' | 'verify' | 'trace' | 'copy'; sourceId: string; targetId: string }[] = []
): RequirementModel {
  return { requirements: reqs, relations: rels };
}

describe('diffRequirementModelsVisible', () => {
  it('detects added requirements', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a'), req('R2', 'b')]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.added.map((r) => r.id)).toEqual(['R2']);
    expect(d.changed).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
  });

  it('detects removed requirements', () => {
    const before = model([req('R1', 'a'), req('R2', 'b')]);
    const after = model([req('R1', 'a')]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.removed.map((r) => r.id)).toEqual(['R2']);
    expect(d.added).toHaveLength(0);
  });

  it('detects statement changes', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a revised')]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.changed.map((c) => c.after.id)).toEqual(['R1']);
  });

  it('detects type / text / parentId changes', () => {
    const before = model([req('R1', 's')]);
    const afterType = model([req('R1', 's', { type: 'nonFunctionalRequirement' })]);
    expect(diffRequirementModelsVisible(before, afterType).changed).toHaveLength(1);

    const afterText = model([req('R1', 's', { text: 'longer prose' })]);
    expect(diffRequirementModelsVisible(before, afterText).changed).toHaveLength(1);

    const afterParent = model([req('R1', 's', { parentId: 'P' })]);
    expect(diffRequirementModelsVisible(before, afterParent).changed).toHaveLength(1);
  });

  it('unchanged model is empty diff', () => {
    const m = model([req('R1', 'a'), req('R2', 'b')], [
      { kind: 'derive', sourceId: 'R1', targetId: 'R2' },
    ]);
    expect(isDiffEmpty(diffRequirementModelsVisible(m, m))).toBe(true);
  });

  it('hidden in before → visible in after counts as added', () => {
    const before = model([req('R1', 'a', { hidden: true })]);
    const after = model([req('R1', 'a')]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.added.map((r) => r.id)).toEqual(['R1']);
    expect(d.changed).toHaveLength(0);
  });

  it('visible in before → hidden in after counts as removed (no marker)', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a', { hidden: true })]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.removed.map((r) => r.id)).toEqual(['R1']);
    expect(d.added).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });

  it('deleted-with-reason counts as removed (ADR-014)', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a', { deleted: true, note: 'out of scope' })]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.removed.map((r) => r.id)).toEqual(['R1']);
  });

  it('a requirement never visible in either side is ignored', () => {
    const before = model([req('R1', 'a', { hidden: true })]);
    const after = model([req('R1', 'a revised', { hidden: true })]);
    expect(isDiffEmpty(diffRequirementModelsVisible(before, after))).toBe(true);
  });

  it('adding a relation promotes the touched requirements to changed', () => {
    const before = model([req('R1', 'a'), req('R2', 'b')]);
    const after = model([req('R1', 'a'), req('R2', 'b')], [
      { kind: 'derive', sourceId: 'R1', targetId: 'R2' },
    ]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.changed.map((c) => c.after.id).sort()).toEqual(['R1', 'R2']);
  });

  it('changing relation kind between the same pair is a change, not add+remove', () => {
    const before = model([req('R1', 'a'), req('R2', 'b')], [
      { kind: 'derive', sourceId: 'R1', targetId: 'R2' },
    ]);
    const after = model([req('R1', 'a'), req('R2', 'b')], [
      { kind: 'refine', sourceId: 'R1', targetId: 'R2' },
    ]);
    const d = diffRequirementModelsVisible(before, after);
    expect(d.changed.map((c) => c.after.id).sort()).toEqual(['R1', 'R2']);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
  });
});
