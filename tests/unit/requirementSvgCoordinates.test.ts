// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import { extractRequirementCoordinates } from '../../src/modelTypes/requirement/svgCoordinates';
import type { RequirementModel } from '../../src/modelTypes/requirement/model';

// Captured from PlantUML Server (v1.2026.1) with the preamble + two
// requirements + a derive relation. Trimmed of the <?plantuml-src ?>
// processing instruction which isn't relevant to coordinate extraction.
const FIXTURE_TWO_REQS = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-diagram-type="CLASS" height="236px" viewBox="0 0 197 236" width="197px" version="1.1">
<g>
  <g class="entity" data-qualified-name="R1" data-source-line="6" id="ent0002">
    <rect fill="#F1F1F1" height="64.5625" rx="2.5" ry="2.5" width="154.3672" x="21.55" y="7"/>
    <text x="22.55" y="23.1387">functionalRequirement</text>
    <text x="72.1145" y="38.9639">light up</text>
  </g>
  <g class="entity" data-qualified-name="R2" data-source-line="12" id="ent0003">
    <rect fill="#F1F1F1" height="80.8594" rx="2.5" ry="2.5" width="183.4727" x="7" y="148.56"/>
    <text x="22.5527" y="164.6987">functionalRequirement</text>
    <text x="65.1821" y="180.5239">emit light</text>
  </g>
  <g class="link" data-entity-1="ent0002" data-entity-2="ent0003">
    <path d="M98,77 C98,100 98,148 98,148" />
  </g>
</g>
</svg>`;

function model(ids: string[]): RequirementModel {
  return {
    requirements: ids.map((id) => ({
      id,
      statement: id,
      text: null,
      type: 'functionalRequirement' as const,
      parentId: null,
      hidden: false,
      deleted: false,
      note: '',
      level: null,
      group: null,
    })),
    relations: [],
  };
}

describe('extractRequirementCoordinates', () => {
  it('locates requirement class boxes by data-qualified-name', () => {
    const coords = extractRequirementCoordinates(FIXTURE_TWO_REQS, model(['R1', 'R2']));
    expect(coords.size).toBe(2);
    expect(coords.get('R1')).toEqual({ x: 21.55, y: 7, width: 154.3672, height: 64.5625 });
    expect(coords.get('R2')).toEqual({ x: 7, y: 148.56, width: 183.4727, height: 80.8594 });
  });

  it('strips the package prefix from a dotted qualified name', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="entity" data-qualified-name="Group1.R1">
        <rect x="196" y="42" width="154" height="64"/>
      </g>
    </svg>`;
    const coords = extractRequirementCoordinates(svg, model(['R1']));
    expect(coords.get('R1')).toEqual({ x: 196, y: 42, width: 154, height: 64 });
  });

  it('ignores entity groups that are not requirements (e.g. the package frame itself)', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="entity" data-qualified-name="Group1">
        <rect x="180" y="7" width="186" height="115"/>
      </g>
      <g class="entity" data-qualified-name="Group1.R1">
        <rect x="196" y="42" width="154" height="64"/>
      </g>
    </svg>`;
    const coords = extractRequirementCoordinates(svg, model(['R1']));
    expect(coords.has('Group1')).toBe(false);
    expect(coords.has('R1')).toBe(true);
  });

  it('sums ancestor translate transforms if any are present', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(100, 50)">
        <g class="entity" data-qualified-name="R1">
          <rect x="10" y="5" width="40" height="20"/>
        </g>
      </g>
    </svg>`;
    const coords = extractRequirementCoordinates(svg, model(['R1']));
    expect(coords.get('R1')).toEqual({ x: 110, y: 55, width: 40, height: 20 });
  });

  it('returns an empty map for an empty / invalid SVG', () => {
    expect(extractRequirementCoordinates('', model(['R1'])).size).toBe(0);
    expect(
      extractRequirementCoordinates('<not-svg/>', model(['R1'])).size
    ).toBe(0);
  });

  it('skips entities with zero width/height', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="entity" data-qualified-name="R1">
        <rect x="10" y="5" width="0" height="20"/>
      </g>
    </svg>`;
    const coords = extractRequirementCoordinates(svg, model(['R1']));
    expect(coords.size).toBe(0);
  });
});
