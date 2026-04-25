// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../src/modelTypes/process/parser';
import { extractProcessCoordinates } from '../../src/modelTypes/process/svgCoordinates';

const EXAMPLES_DIR = join(
  __dirname,
  '..',
  '..',
  'src',
  'grammars',
  'processDiagram.examples'
);

function pair(sampleName: string) {
  const puml = readFileSync(join(EXAMPLES_DIR, `${sampleName}.puml`), 'utf-8');
  const svg = readFileSync(join(EXAMPLES_DIR, `${sampleName}.svg`), 'utf-8');
  const r = parse(puml);
  if (!r.model) throw new Error(`${sampleName}.puml did not parse`);
  return { model: r.model, svg };
}

describe('extractProcessCoordinates', () => {
  it('01-linear: one box per task, in source order', () => {
    const { model, svg } = pair('01-linear');
    const coords = extractProcessCoordinates(svg, model);
    expect(coords.size).toBe(3); // 3 tasks in 01-linear

    // The rects should be ordered top-to-bottom (PlantUML default
    // top-down layout).
    const ys = [...coords.values()].map((c) => c.y).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('02-simple-branch: 2 task rects (審査 + yes-branch + no-branch)', () => {
    const { model, svg } = pair('02-simple-branch');
    const coords = extractProcessCoordinates(svg, model);
    // 3 tasks: 申込内容を確認, 承認通知を送付, 却下通知を送付
    expect(coords.size).toBe(3);
  });

  it('09-events: 8 task rects total (stereotype tasks counted too)', () => {
    const { model, svg } = pair('09-events');
    const coords = extractProcessCoordinates(svg, model);
    expect(coords.size).toBe(8);
  });

  it('returns empty map when svg is empty', () => {
    const { model } = pair('01-linear');
    expect(extractProcessCoordinates('', model).size).toBe(0);
  });

  it('returns empty map when svg is not SVG', () => {
    const { model } = pair('01-linear');
    expect(extractProcessCoordinates('<not-svg/>', model).size).toBe(0);
  });
});
