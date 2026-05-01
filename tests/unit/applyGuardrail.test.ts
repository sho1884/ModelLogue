// SR-130 — apply-time review-evidence guardrail.
//
// Tests the pure id-set diff. Integration with chatStore /
// MessageBubble auto-apply is exercised separately
// (applyGuardrailFlow.test.ts).

import { describe, it, expect } from 'vitest';
import { detectDroppedRequirementIds } from '../../src/modelTypes/requirement/applyGuardrail';
import type { RequirementModel } from '../../src/modelTypes/requirement/model';

function model(
  reqs: { id: string; statement: string; deleted?: boolean }[]
): RequirementModel {
  return {
    requirements: reqs.map((r) => ({
      id: r.id,
      statement: r.statement,
      text: null,
      type: 'functionalRequirement' as const,
      parentId: null,
      hidden: false,
      deleted: r.deleted ?? false,
      note: r.deleted ? 'reason' : '',
      level: null,
      group: null,
    })),
    relations: [],
  };
}

describe('detectDroppedRequirementIds (SR-130)', () => {
  it('returns empty when before-model is null (initial generation)', () => {
    const after = model([{ id: 'R1', statement: 'a' }]);
    expect(detectDroppedRequirementIds(null, after)).toEqual([]);
  });

  it('returns empty when before-model has no requirements', () => {
    const before = model([]);
    const after = model([{ id: 'R1', statement: 'a' }]);
    expect(detectDroppedRequirementIds(before, after)).toEqual([]);
  });

  it('returns empty when every before id is present in the new model', () => {
    const before = model([
      { id: 'R1', statement: 'a' },
      { id: 'R2', statement: 'b' },
    ]);
    const after = model([
      { id: 'R1', statement: 'a (refined)' },
      { id: 'R2', statement: 'b' },
      { id: 'R3', statement: 'newly added' },
    ]);
    expect(detectDroppedRequirementIds(before, after)).toEqual([]);
  });

  it('returns the (id, statement) pair for an id present in before but missing from new', () => {
    const before = model([
      { id: 'R1', statement: 'light up' },
      { id: 'R2', statement: 'emit visible light' },
    ]);
    const after = model([{ id: 'R1', statement: 'light up' }]);
    expect(detectDroppedRequirementIds(before, after)).toEqual([
      { id: 'R2', statement: 'emit visible light' },
    ]);
  });

  it('a row marked deleted=Y in the new model is NOT a drop (id is still present)', () => {
    const before = model([
      { id: 'R1', statement: 'kept' },
      { id: 'R2', statement: 'will be deleted' },
    ]);
    const after = model([
      { id: 'R1', statement: 'kept' },
      { id: 'R2', statement: 'will be deleted', deleted: true },
    ]);
    expect(detectDroppedRequirementIds(before, after)).toEqual([]);
  });

  it('reports multiple drops in before-order', () => {
    const before = model([
      { id: 'R1', statement: 'a' },
      { id: 'R2', statement: 'b' },
      { id: 'R3', statement: 'c' },
      { id: 'R4', statement: 'd' },
    ]);
    const after = model([
      { id: 'R1', statement: 'a' },
      { id: 'R3', statement: 'c' },
    ]);
    expect(detectDroppedRequirementIds(before, after)).toEqual([
      { id: 'R2', statement: 'b' },
      { id: 'R4', statement: 'd' },
    ]);
  });

  it('returns the full before list when new model is null (csv unparseable)', () => {
    const before = model([
      { id: 'R1', statement: 'a' },
      { id: 'R2', statement: 'b' },
    ]);
    expect(detectDroppedRequirementIds(before, null)).toEqual([
      { id: 'R1', statement: 'a' },
      { id: 'R2', statement: 'b' },
    ]);
  });
});
