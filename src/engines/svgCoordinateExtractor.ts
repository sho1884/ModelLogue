// Extract state positions from PlantUML-generated SVG.
//
// Pure function: parse the SVG string, walk each shape's ancestor chain,
// sum every `translate(tx, ty)` transform encountered, add that to the
// shape's local x/y. PlantUML state diagrams only use translate
// transforms, so summation is complete for the supported subset.
//
// Earlier versions tried off-screen DOM insertion + getBoundingClientRect
// + getScreenCTM. That path was fragile in practice (empty results for
// hidden holders in some browsers, unexpected null CTMs, etc.), so the
// project chose to fall back to this predictable pure-function approach.
//
// PlantUML state-diagram SVG shape (for matching):
//   - Each state is a <g> containing <rect> (rounded) and <text>
//   - Initial state [*]: single filled <ellipse>
//   - Final state [*]: two concentric <ellipse> elements
//   - Links: <g class="link" ...>

import type { StateMachineModel } from '../types/stateMachine';

export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CoordinateMap = Map<string, Coordinates>;

// Match every translate() occurrence in a transform attribute. Values
// may be comma- or whitespace-separated, with an optional second
// argument (defaults to 0 per SVG spec).
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

export function extractCoordinates(
  svgString: string,
  model: StateMachineModel
): CoordinateMap {
  const result: CoordinateMap = new Map();
  if (!svgString) return result;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg') return result;

  // Normal states: scan every <g>'s direct children in DOM order and
  // pair each state-body <rect> (identified by the `rx` rounded-corner
  // attribute PlantUML always sets on state bodies) with the NEXT
  // <text> sibling.
  //
  // Why the pair walk: in the default top-to-bottom layout PlantUML
  // wraps each state in its own <g> with exactly [rect, text] as
  // children. But with `left to right direction`, ALL states become
  // flat siblings of a single outer <g>, interleaved as
  // rect/text/rect/text/... An earlier implementation that took only
  // `:scope > rect` + `:scope > text` from each <g> missed every
  // state after the first in the horizontal case.
  const allGroups = Array.from(root.querySelectorAll('g'));
  for (const g of allGroups) {
    if (g.classList.contains('link')) continue;
    const children = Array.from(g.children);
    for (let i = 0; i < children.length; i++) {
      const rect = children[i];
      if (rect.tagName !== 'rect') continue;
      if (!rect.hasAttribute('rx')) continue;

      // Next <text> before the next state rect.
      let text: Element | null = null;
      for (let j = i + 1; j < children.length; j++) {
        const sib = children[j];
        if (sib.tagName === 'text') {
          text = sib;
          break;
        }
        if (sib.tagName === 'rect' && sib.hasAttribute('rx')) break;
      }
      if (!text) continue;

      const textContent = text.textContent?.trim();
      if (!textContent) continue;

      const state = model.states.find(
        (s) =>
          s.type === 'normal' &&
          (s.label === textContent || s.id === textContent)
      );
      if (!state) continue;

      const { tx, ty } = sumAncestorTranslate(rect, root);
      const x = parseFloat(rect.getAttribute('x') ?? '0') + tx;
      const y = parseFloat(rect.getAttribute('y') ?? '0') + ty;
      const width = parseFloat(rect.getAttribute('width') ?? '0');
      const height = parseFloat(rect.getAttribute('height') ?? '0');
      if (width > 0 && height > 0) {
        result.set(state.id, { x, y, width, height });
      }
    }
  }

  // Pseudo-states via <ellipse>. Final: two concentric at the same
  // center. Initial: a single filled ellipse.
  const ellipses = Array.from(root.querySelectorAll('ellipse'));
  const processed = new Set<Element>();

  const ellipsesByCenter = new Map<string, Element[]>();
  for (const el of ellipses) {
    const { tx, ty } = sumAncestorTranslate(el, root);
    const cx = parseFloat(el.getAttribute('cx') ?? '0') + tx;
    const cy = parseFloat(el.getAttribute('cy') ?? '0') + ty;
    const key = `${cx.toFixed(2)},${cy.toFixed(2)}`;
    const list = ellipsesByCenter.get(key) ?? [];
    list.push(el);
    ellipsesByCenter.set(key, list);
  }

  for (const [, group] of ellipsesByCenter) {
    if (group.length >= 2) {
      const finalState = model.states.find((s) => s.type === 'final');
      if (finalState && !result.has(finalState.id)) {
        const el = group[0];
        const { tx, ty } = sumAncestorTranslate(el, root);
        const cx = parseFloat(el.getAttribute('cx') ?? '0') + tx;
        const cy = parseFloat(el.getAttribute('cy') ?? '0') + ty;
        const rx = parseFloat(el.getAttribute('rx') ?? '10');
        const ry = parseFloat(el.getAttribute('ry') ?? '10');
        result.set(finalState.id, {
          x: cx - rx,
          y: cy - ry,
          width: rx * 2,
          height: ry * 2,
        });
        group.forEach((e) => processed.add(e));
      }
    }
  }

  for (const el of ellipses) {
    if (processed.has(el)) continue;
    const fill = el.getAttribute('fill') ?? '';
    if (fill && fill !== 'none') {
      const initialState = model.states.find((s) => s.type === 'initial');
      if (initialState && !result.has(initialState.id)) {
        const { tx, ty } = sumAncestorTranslate(el, root);
        const cx = parseFloat(el.getAttribute('cx') ?? '0') + tx;
        const cy = parseFloat(el.getAttribute('cy') ?? '0') + ty;
        const rx = parseFloat(el.getAttribute('rx') ?? '10');
        const ry = parseFloat(el.getAttribute('ry') ?? '10');
        result.set(initialState.id, {
          x: cx - rx,
          y: cy - ry,
          width: rx * 2,
          height: ry * 2,
        });
      }
      break;
    }
  }

  return result;
}
