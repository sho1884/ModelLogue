// Place auto-markers on the requirement diagram (v7.5).
//
// Pure function: (diff, coords) → AutoMarker[]. The caller (modelStore)
// computes the diff between before/after RequirementModels and hands
// over the coordinate map from the post-apply SVG; this module decides
// which requirements get rectangles, in which color, around which
// bounding box.
//
// Design per user direction (2026-04-23):
// - Added requirements → green rectangles (COLOR_ADDED in ProposalView).
// - Changed requirements → amber rectangles (COLOR_CHANGED).
// - Removed requirements → no marker. The reviewer checks the
//   Requirement list tab for deletion rationale; trying to mark a
//   position that no longer exists on the diagram would be misleading.

import type { RequirementDiff } from './diff';
import type { CoordinateMap } from '../../engines/svgCoordinateExtractor';
import type { AutoMarker } from '../../types/marker';

// Slight outward inset so the rectangle sits AROUND the class box,
// not coincident with its stroke. 4px matches the spacing used by
// ProposalView.tsx's diff overlay.
const INSET = 4;

function markerId(kind: string, elementId: string): string {
  return `auto-${kind}-${elementId}`;
}

export function placeAutoMarkers(
  diff: RequirementDiff,
  coords: CoordinateMap
): AutoMarker[] {
  const out: AutoMarker[] = [];

  for (const r of diff.added) {
    const c = coords.get(r.id);
    if (!c) continue;
    out.push({
      id: markerId('added', r.id),
      kind: 'added',
      rect: {
        x: c.x - INSET,
        y: c.y - INSET,
        width: c.width + INSET * 2,
        height: c.height + INSET * 2,
      },
      elementId: r.id,
    });
  }

  for (const c of diff.changed) {
    const rect = coords.get(c.after.id);
    if (!rect) continue;
    out.push({
      id: markerId('changed', c.after.id),
      kind: 'changed',
      rect: {
        x: rect.x - INSET,
        y: rect.y - INSET,
        width: rect.width + INSET * 2,
        height: rect.height + INSET * 2,
      },
      elementId: c.after.id,
    });
  }

  return out;
}
