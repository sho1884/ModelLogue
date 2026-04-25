import { describe, it, expect } from 'vitest';
import { parse } from '../../src/modelTypes/process/parser';
import { diffProcessModels } from '../../src/modelTypes/process/diff';
import { placeProcessAutoMarkers } from '../../src/modelTypes/process/autoMarkerPlacement';
import { walkProcessNodes } from '../../src/modelTypes/process/model';
import type { CoordinateMap } from '../../src/engines/svgCoordinateExtractor';

function parseOrFail(source: string) {
  const r = parse(source);
  if (!r.model) throw new Error('parse failed');
  return r.model;
}

// Build a coordinate map that assigns a unique rect to each task by
// depth-first index.
function fakeCoords(model: ReturnType<typeof parseOrFail>): CoordinateMap {
  const m: CoordinateMap = new Map();
  let i = 0;
  walkProcessNodes(model.rootBody, (n) => {
    if (n.kind === 'task') {
      m.set(n.id, { x: i * 100, y: i * 50, width: 80, height: 30 });
      i++;
    }
  });
  return m;
}

const BEFORE = `@startuml
|lane|
start
:A;
:B;
stop
@enduml`;

describe('placeProcessAutoMarkers', () => {
  it('added task → green marker', () => {
    const before = parseOrFail(BEFORE);
    const after = parseOrFail(`@startuml
|lane|
start
:A;
:B;
:C;
stop
@enduml`);
    const coords = fakeCoords(after);
    const markers = placeProcessAutoMarkers(
      diffProcessModels(before, after),
      coords
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].kind).toBe('added');
  });

  it('lane change → amber marker', () => {
    const before = parseOrFail(BEFORE);
    const after = parseOrFail(`@startuml
|lane|
start
:A;
|other|
:B;
stop
@enduml`);
    const coords = fakeCoords(after);
    const markers = placeProcessAutoMarkers(
      diffProcessModels(before, after),
      coords
    );
    expect(markers).toHaveLength(1);
    expect(markers[0].kind).toBe('changed');
  });

  it('removed task emits no marker', () => {
    const before = parseOrFail(BEFORE);
    const after = parseOrFail(`@startuml
|lane|
start
:A;
stop
@enduml`);
    const coords = fakeCoords(after);
    const markers = placeProcessAutoMarkers(
      diffProcessModels(before, after),
      coords
    );
    expect(markers).toHaveLength(0);
  });

  it('insets the rect by 4 px on all sides', () => {
    const before = parseOrFail(BEFORE);
    const after = parseOrFail(`@startuml
|lane|
start
:A;
:B;
:C;
stop
@enduml`);
    const coords = fakeCoords(after);
    const markers = placeProcessAutoMarkers(
      diffProcessModels(before, after),
      coords
    );
    const m = markers[0];
    const originalCoords = coords.get(m.elementId)!;
    expect(m.rect.x).toBe(originalCoords.x - 4);
    expect(m.rect.y).toBe(originalCoords.y - 4);
    expect(m.rect.width).toBe(originalCoords.width + 8);
    expect(m.rect.height).toBe(originalCoords.height + 8);
  });
});
