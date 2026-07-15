// Tests for the process-diagram table EXPORTS (roles / artifacts).
//
// These serializers had no tests at all, which is how they came to disagree
// with the screen: the views rendered `—` for an empty cell while the HTML
// clipboard payload and the .csv emitted nothing. The same defect the state
// transition matrix had (SR-020), in the same shape — a presentation rule
// written twice, updated once.
//
// So these tests assert the property that was broken, not the implementation:
// whatever a reviewer sees in an empty cell, the exports say the same thing.

import { describe, it, expect } from 'vitest';
import { EMPTY_CELL_DISPLAY } from '../../src/types/matrix';
import {
  rolesToCsv,
  rolesToHtml,
  type RoleRow,
} from '../../src/modelTypes/process/roles';
import {
  artifactsToCsv,
  artifactsToHtml,
  type ArtifactRow,
} from '../../src/modelTypes/process/artifacts';

describe('artifacts exports (SR-123)', () => {
  // An artifact nobody produces, or nobody consumes, is a review finding —
  // exactly the row you want to notice. A blank cell buries it.
  const orphan: ArtifactRow[] = [
    { name: '申込書', producers: ['受付'], consumers: ['審査'] },
    { name: '謎の帳票', producers: [], consumers: [] },
  ];

  it('HTML: an empty producers/consumers cell carries the marker, not nothing', () => {
    const html = artifactsToHtml(orphan);
    expect(html).not.toContain('<td></td>');
    expect(html).toContain(
      `<tr><td>謎の帳票</td><td>${EMPTY_CELL_DISPLAY}</td><td>${EMPTY_CELL_DISPLAY}</td></tr>`
    );
  });

  it('CSV: same — the row reads the same in a spreadsheet as on screen', () => {
    const rows = artifactsToCsv(orphan).split('\n');
    expect(rows[1]).toBe('申込書,受付,審査');
    expect(rows[2]).toBe(
      `謎の帳票,${EMPTY_CELL_DISPLAY},${EMPTY_CELL_DISPLAY}`
    );
  });

  it('a populated cell is untouched by the marker rule', () => {
    const html = artifactsToHtml(orphan);
    expect(html).toContain('<td>受付</td>');
    expect(artifactsToCsv(orphan).split('\n')[1]).toContain('受付');
  });
});

describe('roles exports (SR-122)', () => {
  // A lane with no hand-offs never coordinates with anyone — again, the row a
  // reviewer should see, not skim past as unfilled.
  const isolated: RoleRow[] = [
    {
      lane: '営業',
      tasks: ['受付'],
      outgoingHandOffs: [
        {
          fromTask: '受付',
          toTask: '審査',
          fromLane: '営業',
          toLane: '審査部',
          artifact: '申込書',
        },
      ],
      incomingHandOffs: [],
    },
    {
      lane: '総務',
      tasks: ['掲示'],
      outgoingHandOffs: [],
      incomingHandOffs: [],
    },
  ];

  it('HTML: empty hand-off cells carry the marker, not nothing', () => {
    const html = rolesToHtml(isolated);
    expect(html).not.toContain('<td></td>');
    expect(html).toContain(
      `<tr><td>総務</td><td>掲示</td><td>${EMPTY_CELL_DISPLAY}</td><td>${EMPTY_CELL_DISPLAY}</td></tr>`
    );
  });

  it('CSV: same', () => {
    const rows = rolesToCsv(isolated).split('\n');
    expect(rows[2]).toBe(`総務,掲示,${EMPTY_CELL_DISPLAY},${EMPTY_CELL_DISPLAY}`);
  });

  it('a populated hand-off cell still renders in full', () => {
    const csv = rolesToCsv(isolated);
    expect(csv).toContain('受付 → 審査(審査部) [申込書]');
    expect(rolesToHtml(isolated)).toContain('受付 → 審査(審査部) [申込書]');
  });
});
