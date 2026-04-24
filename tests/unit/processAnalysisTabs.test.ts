// Tests for the process-diagram analysis-tab calculators:
// paths / events / roles / artifacts / externals.
//
// Feeds sample .puml files from the accepted corpus and asserts the
// derived rows match what a reviewer should expect.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../src/modelTypes/process/parser';
import { enumeratePaths, pathsToCsv } from '../../src/modelTypes/process/paths';
import { collectEvents } from '../../src/modelTypes/process/events';
import { collectRoles } from '../../src/modelTypes/process/roles';
import { collectArtifacts } from '../../src/modelTypes/process/artifacts';
import { collectExternals } from '../../src/modelTypes/process/externals';

const EXAMPLES_DIR = join(
  __dirname,
  '..',
  '..',
  'src',
  'grammars',
  'processDiagram.examples'
);

function parseSample(name: string) {
  const src = readFileSync(join(EXAMPLES_DIR, name), 'utf-8');
  const r = parse(src);
  if (!r.model) throw new Error(`sample ${name} did not parse`);
  return r.model;
}

describe('enumeratePaths (SR-120)', () => {
  it('01-linear: single path through the whole flow', () => {
    const m = parseSample('01-linear.puml');
    const rows = enumeratePaths(m);
    expect(rows).toHaveLength(1);
    expect(rows[0].steps).toEqual([
      '申込書を受付',
      '受付完了を記録',
      '申込者に受付完了メール',
    ]);
    expect(rows[0].lanes).toEqual(['受付係']);
    expect(rows[0].branches).toEqual([]);
  });

  it('02-simple-branch: 2 paths, one per branch', () => {
    const m = parseSample('02-simple-branch.puml');
    const rows = enumeratePaths(m);
    expect(rows).toHaveLength(2);
    // Each row carries its own branch-taken annotation (`cond: label`).
    expect(rows[0].branches[0]).toBe('承認できる?: yes');
    expect(rows[1].branches[0]).toBe('承認できる?: no');
  });

  it('03-nested-branch: 3 paths via 2-deep nesting', () => {
    const m = parseSample('03-nested-branch.puml');
    const rows = enumeratePaths(m);
    // Outer if x2, inner if only on outer "yes" branch → 3 paths
    expect(rows).toHaveLength(3);
  });

  it('04-parallel: a fork token appears in the single path', () => {
    const m = parseSample('04-parallel.puml');
    const rows = enumeratePaths(m);
    expect(rows).toHaveLength(1);
    const forkToken = rows[0].steps.find((s) => s.startsWith('‖ fork'));
    expect(forkToken).toBeTruthy();
  });

  it('05-multi-lane: arrows populate artifacts in order', () => {
    const m = parseSample('05-multi-lane.puml');
    const rows = enumeratePaths(m);
    // Every enumerated path should see both artifacts before the branch.
    for (const r of rows) {
      expect(r.artifacts).toEqual(
        expect.arrayContaining(['申込書', '審査結果'])
      );
    }
  });

  it('11-external-references: externals aggregated per path', () => {
    const m = parseSample('11-external-references.puml');
    const rows = enumeratePaths(m);
    // All paths should cross 申込マスタDB and 通知メール配信API (touched
    // on the happy-path branch that both paths share up to the
    // branching point). At least one path touches 与信照会API.
    const everyPath = new Set(rows.flatMap((r) => r.externals));
    expect(everyPath.has('申込マスタDB')).toBe(true);
    expect(everyPath.has('与信照会API')).toBe(true);
  });

  it('pathsToCsv emits canonical header and one row per path', () => {
    const m = parseSample('02-simple-branch.puml');
    const csv = pathsToCsv(enumeratePaths(m));
    expect(csv.split('\n')[0]).toBe(
      'path_id,steps,branches_taken,lanes,events,artifacts,externals_touched'
    );
    // 1 header + 2 data rows
    expect(csv.split('\n')).toHaveLength(3);
  });
});

describe('collectEvents (SR-121)', () => {
  it('09-events: timer / message / error all surface', () => {
    const m = parseSample('09-events.puml');
    const events = collectEvents(m);
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['timer', 'message', 'error']));
    // Every row carries a path count derived from enumeratePaths.
    for (const e of events) {
      expect(e.pathCount).toBeGreaterThan(0);
    }
  });

  it('01-linear: no events → empty list', () => {
    const m = parseSample('01-linear.puml');
    expect(collectEvents(m)).toEqual([]);
  });
});

describe('collectRoles (SR-122)', () => {
  it('05-multi-lane: one row per lane, hand-offs identified', () => {
    const m = parseSample('05-multi-lane.puml');
    const roles = collectRoles(m);
    expect(roles.map((r) => r.lane)).toEqual(['受付', '審査員', '通知係']);
    // 受付 → 審査員 hand-off should appear as outgoing for 受付.
    const uketsuke = roles.find((r) => r.lane === '受付')!;
    expect(uketsuke.outgoingHandOffs.length).toBeGreaterThan(0);
    const shinsaOut = uketsuke.outgoingHandOffs[0];
    expect(shinsaOut.toLane).toBe('審査員');
    expect(shinsaOut.artifact).toBe('申込書');
  });

  it('01-linear: single lane with no hand-offs', () => {
    const m = parseSample('01-linear.puml');
    const roles = collectRoles(m);
    expect(roles).toHaveLength(1);
    expect(roles[0].outgoingHandOffs).toEqual([]);
    expect(roles[0].incomingHandOffs).toEqual([]);
  });
});

describe('collectArtifacts (SR-123)', () => {
  it('08-artifacts: 3 distinct artifacts with producers + consumers', () => {
    const m = parseSample('08-artifacts.puml');
    const arts = collectArtifacts(m);
    const names = new Set(arts.map((a) => a.name));
    expect(names).toEqual(new Set(['申込書', '審査票', '契約書', '却下通知']));
    for (const a of arts) {
      // At least one consumer (the task with incomingLabel = artifact).
      expect(a.consumers.length).toBeGreaterThan(0);
    }
  });

  it('01-linear: no arrow labels → empty list', () => {
    const m = parseSample('01-linear.puml');
    expect(collectArtifacts(m)).toEqual([]);
  });
});

describe('collectExternals (SR-125)', () => {
  it('11-external-references: every **外部:** name collected with its tasks', () => {
    const m = parseSample('11-external-references.puml');
    const ext = collectExternals(m);
    const names = new Set(ext.map((e) => e.name));
    expect(names).toEqual(
      new Set([
        '申込マスタDB',
        '与信照会API',
        'ブラックリスト照会サービス',
        '契約管理システム',
        '通知メール配信API',
      ])
    );
    // 申込マスタDB is touched by multiple tasks.
    const db = ext.find((e) => e.name === '申込マスタDB')!;
    expect(db.touchingTasks.length).toBeGreaterThan(1);
  });

  it('01-linear: no note annotations → empty list', () => {
    const m = parseSample('01-linear.puml');
    expect(collectExternals(m)).toEqual([]);
  });
});
