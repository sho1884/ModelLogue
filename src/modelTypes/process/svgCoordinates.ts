// Extract task-box positions from PlantUML-generated activity-diagram
// SVG for the process model type (v7.6).
//
// Unlike the class-diagram SVG used by requirement sessions, PlantUML
// activity SVG is essentially flat: no `<g class="entity">` wrappers,
// no `data-qualified-name`, no `data-source-line` on individual
// shapes. Tasks are just `<rect rx="12.5">` + adjacent `<text>`
// siblings. To link each rect back to a model task, we zip them by
// position — the N-th task rect in DOM order corresponds to the N-th
// task in the model's depth-first walk (PlantUML v1.2026.x renders
// tasks in declaration order, confirmed against all 11 accepted
// corpus samples).
//
// Translate summing on ancestor `<g>` elements is kept defensive even
// though observed activity SVG puts every task under a single outer
// group with no transforms.

import type { ProcessModel, ProcessTask } from './model';
import { walkProcessNodes } from './model';
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

export function extractProcessCoordinates(
  svgString: string,
  model: ProcessModel
): CoordinateMap {
  const result: CoordinateMap = new Map();
  if (!svgString) return result;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg') return result;

  // Collect task rects in DOM order. PlantUML activity uses a fixed
  // `rx="12.5"` on task bodies; non-task rects (partition frames,
  // notes, diamonds rendered as polygons are unaffected, etc.) do
  // not match this attribute combination.
  const rects: Coordinates[] = [];
  for (const rect of Array.from(root.querySelectorAll('rect'))) {
    if (rect.getAttribute('rx') !== '12.5') continue;
    const w = parseFloat(rect.getAttribute('width') ?? '0');
    const h = parseFloat(rect.getAttribute('height') ?? '0');
    if (w <= 0 || h <= 0) continue;
    const { tx, ty } = sumAncestorTranslate(rect, root);
    const x = parseFloat(rect.getAttribute('x') ?? '0') + tx;
    const y = parseFloat(rect.getAttribute('y') ?? '0') + ty;
    rects.push({ x, y, width: w, height: h });
  }

  // Collect model tasks in source (depth-first) order.
  const tasks: ProcessTask[] = [];
  walkProcessNodes(model.rootBody, (n) => {
    if (n.kind === 'task') tasks.push(n);
  });

  // Zip. If rect count differs from task count (e.g. PlantUML omitted
  // rendering for some reason, or a new rect kind uses rx=12.5 we
  // didn't anticipate), we still map as many pairs as possible
  // rather than failing outright — auto-markers for missing tasks
  // just won't appear.
  const n = Math.min(rects.length, tasks.length);
  for (let i = 0; i < n; i++) {
    result.set(tasks[i].id, rects[i]);
  }
  return result;
}
