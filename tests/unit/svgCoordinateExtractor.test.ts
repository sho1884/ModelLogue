// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { extractCoordinates } from '../../src/engines/svgCoordinateExtractor';
import type { StateMachineModel } from '../../src/types/stateMachine';

const model: StateMachineModel = {
  states: [
    { id: 'A', label: 'A', type: 'normal', parentId: null },
    { id: 'B', label: 'B', type: 'normal', parentId: null },
    { id: '[*]_init', label: '[*]', type: 'initial', parentId: null },
    { id: '[*]_final', label: '[*]', type: 'final', parentId: null },
  ],
  transitions: [],
  events: [],
};

describe('extractCoordinates (SR-011)', () => {
  it('sums ancestor translate() transforms so nodes land at their rendered positions', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300">
      <g transform="translate(50,20)">
        <g transform="translate(10,10)">
          <rect rx="12.5" ry="12.5" x="0" y="0" width="80" height="40"/>
          <text>A</text>
        </g>
        <g transform="translate(200,100)">
          <rect rx="12.5" ry="12.5" x="0" y="0" width="80" height="40"/>
          <text>B</text>
        </g>
      </g>
    </svg>`;

    const coords = extractCoordinates(svg, model);
    expect(coords.get('A')).toEqual({ x: 60, y: 30, width: 80, height: 40 });
    expect(coords.get('B')).toEqual({ x: 250, y: 120, width: 80, height: 40 });
  });

  it('locates initial and final pseudo-states by ellipse shape', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <g transform="translate(20,10)">
        <ellipse cx="10" cy="10" rx="6" ry="6" fill="#222222"/>
      </g>
      <g transform="translate(300,150)">
        <ellipse cx="0" cy="0" rx="8" ry="8" fill="none" stroke="#000"/>
        <ellipse cx="0" cy="0" rx="4" ry="4" fill="#000"/>
      </g>
    </svg>`;

    const coords = extractCoordinates(svg, model);
    const initial = coords.get('[*]_init');
    expect(initial).toBeDefined();
    expect(initial!.x).toBeCloseTo(30 - 6);
    expect(initial!.y).toBeCloseTo(20 - 6);
    const finalBox = coords.get('[*]_final');
    expect(finalBox).toBeDefined();
    expect(finalBox!.x).toBeCloseTo(300 - 8);
    expect(finalBox!.y).toBeCloseTo(150 - 8);
  });

  it('handles PlantUML `left to right direction` layout where all states are flat siblings of one <g>', () => {
    // This mirrors actual PlantUML output for horizontal diagrams.
    // All state bodies (rect with rx) and their names (text) are
    // direct children of ONE outer <g>, interleaved rect/text/rect...
    const flatModel: StateMachineModel = {
      states: [
        { id: '[*]', label: '[*]', type: 'initial', parentId: null },
        { id: 'A', label: 'A', type: 'normal', parentId: null },
        { id: 'B', label: 'B', type: 'normal', parentId: null },
        { id: 'C', label: 'C', type: 'normal', parentId: null },
        { id: '[*]_final', label: '[*]', type: 'final', parentId: null },
      ],
      transitions: [],
      events: [],
    };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60">
      <g>
        <ellipse cx="16" cy="27" rx="10" ry="10" fill="#222222"/>
        <rect rx="12.5" ry="12.5" width="50" height="40" x="87" y="7"/>
        <text x="107" y="31">A</text>
        <rect rx="12.5" ry="12.5" width="50" height="40" x="215" y="7"/>
        <text x="235" y="31">B</text>
        <rect rx="12.5" ry="12.5" width="50" height="40" x="356" y="7"/>
        <text x="376" y="31">C</text>
        <ellipse cx="395" cy="27" rx="6" ry="6" fill="none" stroke="#000"/>
        <ellipse cx="395" cy="27" rx="3" ry="3" fill="#000"/>
      </g>
    </svg>`;
    const coords = extractCoordinates(svg, flatModel);
    expect(coords.get('A')).toEqual({ x: 87, y: 7, width: 50, height: 40 });
    expect(coords.get('B')).toEqual({ x: 215, y: 7, width: 50, height: 40 });
    expect(coords.get('C')).toEqual({ x: 356, y: 7, width: 50, height: 40 });
    expect(coords.get('[*]')).toBeDefined();
    expect(coords.get('[*]_final')).toBeDefined();
  });

  it('returns empty map for empty or non-SVG input', () => {
    expect(extractCoordinates('', model).size).toBe(0);
    expect(extractCoordinates('<div>not svg</div>', model).size).toBe(0);
  });
});
