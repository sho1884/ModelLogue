// Build a human-readable context string that describes the current markers
// and model element positions so the AI can correlate them.
//
// This is the data backing SR-022 ("Provide marker context to AI").

import type { Marker, MarkerGeometry } from '../types/marker';
import type { CoordinateMap } from '../engines/svgCoordinateExtractor';
import type { StateMachineModel } from '../types/stateMachine';

const COLOR_NAMES: Record<string, string> = {
  red: '赤 (red)',
  blue: '青 (blue)',
  green: '緑 (green)',
  purple: '紫 (purple)',
};

function colorName(color: string): string {
  return COLOR_NAMES[color] ?? color;
}

function describeGeometry(g: MarkerGeometry): string {
  switch (g.type) {
    case 'ellipse':
      return `楕円 center=(${Math.round(g.cx)}, ${Math.round(g.cy)}), radius=(${Math.round(g.rx)}, ${Math.round(g.ry)})`;
    case 'rectangle':
      return `矩形 (${Math.round(g.x)}, ${Math.round(g.y)}) size ${Math.round(g.width)}×${Math.round(g.height)}`;
    case 'arrow':
      return `矢印 (${Math.round(g.x1)}, ${Math.round(g.y1)}) → (${Math.round(g.x2)}, ${Math.round(g.y2)})`;
  }
}

/**
 * Build the context string to send to the AI alongside the user message.
 * Returns an empty string if there are no markers and no coordinates.
 */
export function buildMarkerContext(
  markers: Marker[],
  coordinates: CoordinateMap | null,
  model: StateMachineModel | null
): string {
  const parts: string[] = [];

  // Markers
  if (markers.length > 0) {
    parts.push('--- Diagram Markers ---');
    for (const m of markers) {
      parts.push(`- ${colorName(m.color)} ${describeGeometry(m.geometry)}`);
    }
  }

  // Model element positions (so the AI can correlate markers to states)
  if (coordinates && coordinates.size > 0 && model) {
    parts.push('');
    parts.push('--- Model Element Positions ---');

    // Group by parent for readability
    const topLevel = model.states.filter(
      (s) =>
        s.parentId === null &&
        (s.type === 'normal' || s.type === 'composite')
    );

    for (const state of topLevel) {
      const coords = coordinates.get(state.id);
      const pos = coords
        ? ` (x=${Math.round(coords.x)}, y=${Math.round(coords.y)}, w=${Math.round(coords.width)}, h=${Math.round(coords.height)})`
        : '';
      const typeLabel = state.type === 'composite' ? ' [composite]' : '';
      parts.push(`- ${state.label}${typeLabel}${pos}`);

      // Children
      if (state.type === 'composite') {
        const children = model.states.filter(
          (s) =>
            s.parentId === state.id &&
            (s.type === 'normal' || s.type === 'composite')
        );
        for (const child of children) {
          const childCoords = coordinates.get(child.id);
          const childPos = childCoords
            ? ` (x=${Math.round(childCoords.x)}, y=${Math.round(childCoords.y)}, w=${Math.round(childCoords.width)}, h=${Math.round(childCoords.height)})`
            : '';
          parts.push(`  - ${child.label}${childPos}`);
        }
      }
    }
  }

  // Explanation for the AI (only if we have any context to provide)
  if (parts.length > 0) {
    parts.unshift(
      '[Review Context: The reviewer has placed colored markers on the diagram to indicate areas of interest. ' +
        'Use the marker positions and model element positions to understand which parts of the model the reviewer is pointing at. ' +
        'Refer to markers by their color (e.g. "赤い楕円で示された部分" / "the area marked with the red ellipse"). ' +
        'If the correlation is ambiguous, ask the reviewer to clarify.]'
    );
  }

  return parts.join('\n');
}
