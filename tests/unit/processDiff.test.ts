// Tests for process-model diff (v7.6).

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/modelTypes/process/parser';
import {
  diffProcessModels,
  isProcessDiffEmpty,
} from '../../src/modelTypes/process/diff';

function parseOrFail(source: string) {
  const r = parse(source);
  if (!r.model) throw new Error('parse failed: ' + JSON.stringify(r.errors));
  return r.model;
}

const BASE = `@startuml
|lane|
start
:task A;
:task B;
stop
@enduml`;

describe('diffProcessModels', () => {
  it('identical model = empty diff', () => {
    const m = parseOrFail(BASE);
    expect(isProcessDiffEmpty(diffProcessModels(m, m))).toBe(true);
  });

  it('added task is flagged as added', () => {
    const before = parseOrFail(BASE);
    const after = parseOrFail(`@startuml
|lane|
start
:task A;
:task B;
:task C;
stop
@enduml`);
    const diff = diffProcessModels(before, after);
    expect(diff.added.map((t) => t.label)).toEqual(['task C']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('removed task is flagged as removed (no diagram marker)', () => {
    const before = parseOrFail(BASE);
    const after = parseOrFail(`@startuml
|lane|
start
:task A;
stop
@enduml`);
    const diff = diffProcessModels(before, after);
    expect(diff.removed.map((t) => t.label)).toEqual(['task B']);
    expect(diff.added).toEqual([]);
  });

  it('lane change on the same-labelled task is flagged as changed', () => {
    const before = parseOrFail(BASE);
    const after = parseOrFail(`@startuml
|lane|
start
:task A;
|other|
:task B;
stop
@enduml`);
    const diff = diffProcessModels(before, after);
    expect(diff.changed.map((c) => c.after.label)).toEqual(['task B']);
  });

  it('adding a stereotype is a change', () => {
    const before = parseOrFail(BASE);
    const after = parseOrFail(`@startuml
|lane|
start
:task A;
:task B;<<timer>>
stop
@enduml`);
    const diff = diffProcessModels(before, after);
    expect(diff.changed.map((c) => c.after.label)).toEqual(['task B']);
  });

  it('duplicate labels pair by first-come, extras are added', () => {
    const before = parseOrFail(`@startuml
|lane|
start
:task A;
:task A;
stop
@enduml`);
    const after = parseOrFail(`@startuml
|lane|
start
:task A;
:task A;
:task A;
stop
@enduml`);
    const diff = diffProcessModels(before, after);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].label).toBe('task A');
  });

  it('renaming a task surfaces as remove + add', () => {
    const before = parseOrFail(BASE);
    const after = parseOrFail(`@startuml
|lane|
start
:task A;
:task B renamed;
stop
@enduml`);
    const diff = diffProcessModels(before, after);
    expect(diff.added.map((t) => t.label)).toEqual(['task B renamed']);
    expect(diff.removed.map((t) => t.label)).toEqual(['task B']);
  });
});
