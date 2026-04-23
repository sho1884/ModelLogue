// Extract requirement box positions from PlantUML-generated class-diagram SVG.
//
// PlantUML class-diagram shape (for matching):
//   <g class="entity" data-qualified-name="<id-or-Package.id>" ...>
//     <rect x="…" y="…" width="…" height="…" ... />
//     <text>…</text>
//     ... other children (dividers, member lines)
//   </g>
//
// PlantUML class diagrams emit absolute x/y on the entity's rect (no
// ancestor translate transforms in the observed output, with or without
// package frames). We still sum ancestor translates defensively so the
// extractor keeps working if a future PlantUML release changes its
// strategy.
//
// data-qualified-name carries the fully-qualified alias —
// "R1" at top level, "Group1.R1" when inside a `package "Group1"`
// block. The last dotted segment is the requirement id we care about.

import type { RequirementModel } from './model';
import type {
  Coordinates,
  CoordinateMap,
} from '../../engines/svgCoordinateExtractor';

const TRANSLATE_PATTERN =
  /translate\s*\(\s*([-+\d.eE]+)(?:[\s,]+([-+\d.eE]+))?\s*\)/g;

function sumAncestorTranslate(
  el: Element,
  root: Element
): { tx: number; ty: number } {
  let tx = 0;
  let ty = 0;
  let current: Element | null = el;
  while (current && current !== root) {
    const transform = current.getAttribute('transform');
    if (transform) {
      TRANSLATE_PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TRANSLATE_PATTERN.exec(transform)) !== null) {
        tx += parseFloat(m[1]);
        ty += parseFloat(m[2] ?? '0');
      }
    }
    current = current.parentElement;
  }
  return { tx, ty };
}

function lastDottedSegment(qname: string): string {
  const i = qname.lastIndexOf('.');
  return i < 0 ? qname : qname.slice(i + 1);
}

export function extractRequirementCoordinates(
  svgString: string,
  model: RequirementModel
): CoordinateMap {
  const result: CoordinateMap = new Map();
  if (!svgString) return result;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg') return result;

  const modelIds = new Set(model.requirements.map((r) => r.id));

  const entities = Array.from(
    root.querySelectorAll('g.entity[data-qualified-name]')
  );

  for (const g of entities) {
    const qname = g.getAttribute('data-qualified-name') ?? '';
    const id = lastDottedSegment(qname);
    // Packages also render as <g class="entity">; filter to known
    // requirement ids so the map only carries coords for things the
    // model knows about.
    if (!modelIds.has(id)) continue;

    // The first direct <rect> child is the entity's bounding rectangle.
    // (Subsequent <rect>s, if any, belong to member compartments.)
    const rect = Array.from(g.children).find(
      (c) => c.tagName === 'rect'
    );
    if (!rect) continue;

    const { tx, ty } = sumAncestorTranslate(rect, root);
    const x = parseFloat(rect.getAttribute('x') ?? '0') + tx;
    const y = parseFloat(rect.getAttribute('y') ?? '0') + ty;
    const width = parseFloat(rect.getAttribute('width') ?? '0');
    const height = parseFloat(rect.getAttribute('height') ?? '0');
    if (width <= 0 || height <= 0) continue;

    const coords: Coordinates = { x, y, width, height };
    result.set(id, coords);
  }

  return result;
}
