// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readSvgPixelSize, withExplicitSize } from '../../src/engines/diagramExport';

describe('diagramExport size helpers', () => {
  it('reads width/height attributes', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"></svg>';
    expect(readSvgPixelSize(svg)).toEqual({ width: 320, height: 240 });
  });

  it('falls back to the viewBox when width/height are missing', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400"></svg>';
    expect(readSvgPixelSize(svg)).toEqual({ width: 500, height: 400 });
  });

  it('falls back to defaults when neither is present', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(readSvgPixelSize(svg)).toEqual({ width: 400, height: 300 });
  });

  it('ignores non-numeric width (e.g. percentage) and uses the viewBox', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 128 64"></svg>';
    expect(readSvgPixelSize(svg)).toEqual({ width: 128, height: 64 });
  });

  it('injects explicit width/height for rasterization', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 128 64"><rect/></svg>';
    const out = withExplicitSize(svg, { width: 128, height: 64 });
    expect(out).toMatch(/width="128"/);
    expect(out).toMatch(/height="64"/);
    expect(out).toContain('<rect');
  });
});
