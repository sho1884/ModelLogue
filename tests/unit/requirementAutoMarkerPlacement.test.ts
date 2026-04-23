import { describe, it, expect } from 'vitest';
import { placeAutoMarkers } from '../../src/modelTypes/requirement/autoMarkerPlacement';
import { diffRequirementModelsVisible } from '../../src/modelTypes/requirement/diff';
import type { RequirementModel } from '../../src/modelTypes/requirement/model';
import type { CoordinateMap } from '../../src/engines/svgCoordinateExtractor';

function req(id: string, statement: string, overrides: Partial<{ hidden: boolean; deleted: boolean; note: string }> = {}) {
  return {
    id,
    statement,
    text: null,
    type: 'functionalRequirement' as const,
    parentId: null,
    hidden: overrides.hidden ?? false,
    deleted: overrides.deleted ?? false,
    note: overrides.note ?? '',
  };
}

function model(
  reqs: ReturnType<typeof req>[]
): RequirementModel {
  return { requirements: reqs, relations: [] };
}

function coords(map: Record<string, { x: number; y: number; w: number; h: number }>): CoordinateMap {
  const out: CoordinateMap = new Map();
  for (const [id, c] of Object.entries(map)) {
    out.set(id, { x: c.x, y: c.y, width: c.w, height: c.h });
  }
  return out;
}

describe('placeAutoMarkers', () => {
  it('marks an added requirement as kind=added (green)', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a'), req('R2', 'b')]);
    const diff = diffRequirementModelsVisible(before, after);
    const m = placeAutoMarkers(
      diff,
      coords({
        R1: { x: 10, y: 10, w: 100, h: 50 },
        R2: { x: 200, y: 10, w: 100, h: 50 },
      })
    );
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('added');
    expect(m[0].elementId).toBe('R2');
  });

  it('marks a changed requirement as kind=changed (amber)', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a revised')]);
    const diff = diffRequirementModelsVisible(before, after);
    const m = placeAutoMarkers(diff, coords({ R1: { x: 10, y: 10, w: 100, h: 50 } }));
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('changed');
    expect(m[0].elementId).toBe('R1');
  });

  it('insets the rectangle outward by 4px on all sides', () => {
    const before = model([req('R1', 'a')]);
    const after = model([req('R1', 'a'), req('R2', 'b')]);
    const diff = diffRequirementModelsVisible(before, after);
    const m = placeAutoMarkers(
      diff,
      coords({ R2: { x: 200, y: 100, w: 80, h: 40 } })
    );
    expect(m[0].rect).toEqual({ x: 196, y: 96, width: 88, height: 48 });
  });

  it('skips elements with no coordinates', () => {
    const before = model([]);
    const after = model([req('R1', 'a'), req('R2', 'b')]);
    const diff = diffRequirementModelsVisible(before, after);
    // Only R1 has coords; R2 is skipped silently.
    const m = placeAutoMarkers(diff, coords({ R1: { x: 1, y: 2, w: 3, h: 4 } }));
    expect(m.map((x) => x.elementId)).toEqual(['R1']);
  });

  it('does not emit markers for removed requirements', () => {
    const before = model([req('R1', 'a'), req('R2', 'b')]);
    const after = model([req('R1', 'a')]);
    const diff = diffRequirementModelsVisible(before, after);
    const m = placeAutoMarkers(diff, coords({ R1: { x: 1, y: 2, w: 3, h: 4 } }));
    expect(m).toHaveLength(0);
  });

  it('returns an empty list when the diff is empty', () => {
    const m = model([req('R1', 'a')]);
    const diff = diffRequirementModelsVisible(m, m);
    expect(placeAutoMarkers(diff, coords({ R1: { x: 1, y: 2, w: 3, h: 4 } }))).toHaveLength(0);
  });
});
