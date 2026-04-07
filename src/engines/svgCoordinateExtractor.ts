// Extract state positions from PlantUML-generated SVG
//
// PlantUML state diagram SVG structure:
//   - Each state is a <g> containing:
//     - <rect rx="12.5" ...> (rounded rect for the state box)
//     - <line> (separator between name area and lower area)
//     - <text> (state name)
//   - Initial state [*]: <ellipse fill="#222222"> (single filled circle)
//   - Final state [*]: two <ellipse> elements (outer hollow + inner filled)
//   - Links: <g class="link" data-entity-1="..." data-entity-2="...">

import type { StateMachineModel } from '../types/stateMachine';

export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CoordinateMap = Map<string, Coordinates>;

export function extractCoordinates(
  svgString: string,
  model: StateMachineModel
): CoordinateMap {
  const result: CoordinateMap = new Map();

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  // Strategy: find <g> groups that contain both <rect> and <text>,
  // then match text content to state labels/IDs
  const groups = doc.querySelectorAll('g');

  for (const g of groups) {
    // Skip link groups
    if (g.classList.contains('link')) continue;

    const rect = g.querySelector('rect');
    const text = g.querySelector('text');
    if (!rect || !text) continue;

    const textContent = text.textContent?.trim();
    if (!textContent) continue;

    // Match to a state by label or ID
    const state = model.states.find(
      (s) =>
        s.type === 'normal' &&
        (s.label === textContent || s.id === textContent)
    );
    if (!state) continue;

    const x = parseFloat(rect.getAttribute('x') ?? '0');
    const y = parseFloat(rect.getAttribute('y') ?? '0');
    const width = parseFloat(rect.getAttribute('width') ?? '0');
    const height = parseFloat(rect.getAttribute('height') ?? '0');

    if (width > 0 && height > 0) {
      result.set(state.id, { x, y, width, height });
    }
  }

  // Handle pseudo-states (initial/final) via ellipse elements
  const ellipses = doc.querySelectorAll('ellipse');
  const processedEllipses = new Set<Element>();

  // Final state: two ellipses at same center (outer hollow + inner filled)
  // Identify finals first (they have pairs)
  const ellipsesByCenter = new Map<string, Element[]>();
  for (const el of ellipses) {
    const cx = el.getAttribute('cx') ?? '0';
    const cy = el.getAttribute('cy') ?? '0';
    const key = `${cx},${cy}`;
    const list = ellipsesByCenter.get(key) ?? [];
    list.push(el);
    ellipsesByCenter.set(key, list);
  }

  for (const [, group] of ellipsesByCenter) {
    if (group.length >= 2) {
      // Final state: two ellipses at same center
      const finalState = model.states.find((s) => s.type === 'final');
      if (finalState) {
        const el = group[0]; // use the larger one
        const cx = parseFloat(el.getAttribute('cx') ?? '0');
        const cy = parseFloat(el.getAttribute('cy') ?? '0');
        const rx = parseFloat(el.getAttribute('rx') ?? '10');
        const ry = parseFloat(el.getAttribute('ry') ?? '10');
        result.set(finalState.id, {
          x: cx - rx,
          y: cy - ry,
          width: rx * 2,
          height: ry * 2,
        });
        group.forEach((e) => processedEllipses.add(e));
      }
    }
  }

  // Initial state: single filled ellipse not yet processed
  for (const el of ellipses) {
    if (processedEllipses.has(el)) continue;
    const fill = el.getAttribute('fill') ?? '';
    if (fill && fill !== 'none') {
      const initialState = model.states.find((s) => s.type === 'initial');
      if (initialState && !result.has(initialState.id)) {
        const cx = parseFloat(el.getAttribute('cx') ?? '0');
        const cy = parseFloat(el.getAttribute('cy') ?? '0');
        const rx = parseFloat(el.getAttribute('rx') ?? '10');
        const ry = parseFloat(el.getAttribute('ry') ?? '10');
        result.set(initialState.id, {
          x: cx - rx,
          y: cy - ry,
          width: rx * 2,
          height: ry * 2,
        });
      }
      break; // first filled ellipse is the initial state
    }
  }

  return result;
}
