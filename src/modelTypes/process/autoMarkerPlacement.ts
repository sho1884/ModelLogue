// Place auto-markers on the process diagram after an AI apply (v7.6).
//
// Parallels src/modelTypes/requirement/autoMarkerPlacement.ts but
// operates on ProcessDiff / ProcessTask. Same color semantics:
//   - added task    → solid green rectangle (COLOR_ADDED)
//   - changed task  → dashed amber rectangle (COLOR_CHANGED)
//   - removed task  → no marker (disappears from the redrawn SVG)
//
// The 4 px outward inset matches the requirement and state-machine
// overlay so the visual language is consistent across model types.

import type { ProcessDiff } from './diff';
import type { CoordinateMap } from '../../engines/svgCoordinateExtractor';
import type { AutoMarker } from '../../types/marker';

const INSET = 4;

function markerId(kind: string, taskId: string): string {
  return `process-auto-${kind}-${taskId}`;
}

export function placeProcessAutoMarkers(
  diff: ProcessDiff,
  coords: CoordinateMap
): AutoMarker[] {
  const out: AutoMarker[] = [];

  for (const t of diff.added) {
    const c = coords.get(t.id);
    if (!c) continue;
    out.push({
      id: markerId('added', t.id),
      kind: 'added',
      rect: {
        x: c.x - INSET,
        y: c.y - INSET,
        width: c.width + INSET * 2,
        height: c.height + INSET * 2,
      },
      elementId: t.id,
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
