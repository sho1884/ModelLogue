// Process diagram parser — corpus-driven tests (SR-124).
//
// Feeds every .puml file under src/grammars/processDiagram.examples/
// and .../rejected/ into the parser and asserts the expected shape:
// accepted corpus must parse to a ProcessModel with no errors;
// rejected corpus must return null model and at least one error
// referencing the violating line.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from '../../src/modelTypes/process/parser';
import { walkProcessNodes } from '../../src/modelTypes/process/model';

const EXAMPLES_DIR = join(
  __dirname,
  '..',
  '..',
  'src',
  'grammars',
  'processDiagram.examples'
);
const REJECTED_DIR = join(EXAMPLES_DIR, 'rejected');

function loadPuml(dir: string, name: string): string {
  return readFileSync(join(dir, name), 'utf-8');
}

const accepted = readdirSync(EXAMPLES_DIR)
  .filter((f) => f.endsWith('.puml'))
  .sort();
const rejected = readdirSync(REJECTED_DIR)
  .filter((f) => f.endsWith('.puml'))
  .sort();

describe('processParser — accepted corpus', () => {
  it.each(accepted)('%s parses without errors', (name) => {
    const source = loadPuml(EXAMPLES_DIR, name);
    const result = parse(source);
    if (result.errors.length > 0) {
      // Surface the errors in the failure output so the fix is obvious.
      throw new Error(
        `Expected no errors for ${name} but got:\n` +
          result.errors
            .map((e) => `  line ${e.line}: ${e.message}`)
            .join('\n')
      );
    }
    expect(result.model).not.toBeNull();
    expect(result.model!.rootBody.length).toBeGreaterThan(0);
  });

  it('01-linear: rootBody is [start, 3 tasks, stop]', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '01-linear.puml'));
    expect(r.model).not.toBeNull();
    const kinds = r.model!.rootBody.map((n) => n.kind);
    expect(kinds).toEqual(['start', 'task', 'task', 'task', 'stop']);
  });

  it('02-simple-branch: an `if` node with both branches populated', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '02-simple-branch.puml'));
    expect(r.model).not.toBeNull();
    const ifNode = r.model!.rootBody.find((n) => n.kind === 'if');
    expect(ifNode).toBeDefined();
    if (ifNode && ifNode.kind === 'if') {
      expect(ifNode.condition).toContain('承認');
      expect(ifNode.thenLabel).toBe('yes');
      expect(ifNode.elseLabel).toBe('no');
      expect(ifNode.thenBranch.length).toBeGreaterThan(0);
      expect(ifNode.elseBranch.length).toBeGreaterThan(0);
    }
  });

  it('03-nested-branch: outer if contains an inner if in its then-branch', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '03-nested-branch.puml'));
    expect(r.model).not.toBeNull();
    const outer = r.model!.rootBody.find((n) => n.kind === 'if');
    expect(outer?.kind).toBe('if');
    if (outer?.kind === 'if') {
      const inner = outer.thenBranch.find((n) => n.kind === 'if');
      expect(inner?.kind).toBe('if');
    }
  });

  it('04-parallel: fork has 3 branches', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '04-parallel.puml'));
    const fork = r.model!.rootBody.find((n) => n.kind === 'fork');
    expect(fork?.kind).toBe('fork');
    if (fork?.kind === 'fork') {
      expect(fork.branches.length).toBe(3);
    }
  });

  it('05-multi-lane: 3 lanes registered in order', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '05-multi-lane.puml'));
    expect(r.model!.lanes).toEqual(['受付', '審査員', '通知係']);
  });

  it('05-multi-lane: arrow labels become incomingLabel on the next node', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '05-multi-lane.puml'));
    const labels: string[] = [];
    walkProcessNodes(r.model!.rootBody, (n) => {
      if (n.incomingLabel) labels.push(n.incomingLabel);
    });
    expect(labels).toContain('申込書');
    expect(labels).toContain('審査結果');
  });

  it('06-partition-with-lanes: partition body has lane-change tasks', () => {
    const r = parse(
      loadPuml(EXAMPLES_DIR, '06-partition-with-lanes.puml')
    );
    const part = r.model!.rootBody.find((n) => n.kind === 'partition');
    expect(part?.kind).toBe('partition');
    if (part?.kind === 'partition') {
      const lanesInside = part.body
        .filter((n) => n.kind === 'task')
        .map((n) => (n.kind === 'task' ? n.lane : ''));
      // タスク that appear inside the partition use 2 different lanes
      expect(new Set(lanesInside).size).toBeGreaterThan(1);
    }
  });

  it('07-subprocess: partition carries its color tag', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '07-subprocess.puml'));
    const part = r.model!.rootBody.find((n) => n.kind === 'partition');
    if (part?.kind === 'partition') {
      expect(part.color).toBe('#LightYellow');
    }
  });

  it('09-events: timer / message / error stereotypes captured', () => {
    const r = parse(loadPuml(EXAMPLES_DIR, '09-events.puml'));
    const stereotypes: string[] = [];
    walkProcessNodes(r.model!.rootBody, (n) => {
      if (n.kind === 'task' && n.stereotype) {
        stereotypes.push(n.stereotype);
      }
    });
    expect(stereotypes).toContain('timer');
    expect(stereotypes).toContain('message');
    expect(stereotypes).toContain('error');
  });

  it('11-external-references: tasks gain externalReferences from notes', () => {
    const r = parse(
      loadPuml(EXAMPLES_DIR, '11-external-references.puml')
    );
    const allExternals = new Set<string>();
    walkProcessNodes(r.model!.rootBody, (n) => {
      if (n.kind === 'task') {
        n.externalReferences.forEach((x) => allExternals.add(x));
      }
    });
    expect(allExternals).toContain('申込マスタDB');
    expect(allExternals).toContain('与信照会API');
    expect(allExternals).toContain('通知メール配信API');
    expect(allExternals).toContain('ブラックリスト照会サービス');
    expect(allExternals).toContain('契約管理システム');
  });
});

describe('processParser — rejected corpus', () => {
  it.each(rejected)('%s is rejected with at least one error', (name) => {
    const source = loadPuml(REJECTED_DIR, name);
    const result = parse(source);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.model).toBeNull();
  });

  it('01-nested-fork: error mentions nested fork', () => {
    const r = parse(loadPuml(REJECTED_DIR, '01-nested-fork.puml'));
    expect(
      r.errors.some((e) => /nested `fork`/i.test(e.message))
    ).toBe(true);
  });

  it('05-elseif: error mentions elseif and nested if', () => {
    const r = parse(loadPuml(REJECTED_DIR, '05-elseif.puml'));
    expect(r.errors.some((e) => /elseif/i.test(e.message))).toBe(true);
  });

  it('03-while-loop: error mentions while / repeat', () => {
    const r = parse(loadPuml(REJECTED_DIR, '03-while-loop.puml'));
    expect(
      r.errors.some((e) => /while/i.test(e.message) || /repeat/i.test(e.message))
    ).toBe(true);
  });

  it('09-multiple-starts: error mentions exactly one start', () => {
    const r = parse(loadPuml(REJECTED_DIR, '09-multiple-starts.puml'));
    expect(
      r.errors.some(
        (e) => /exactly one `start`|`start`/i.test(e.message)
      )
    ).toBe(true);
  });

  it('10-arrow-label-no-successor: error mentions arrow label', () => {
    const r = parse(
      loadPuml(REJECTED_DIR, '10-arrow-label-no-successor.puml')
    );
    expect(
      r.errors.some((e) => /arrow label|successor/i.test(e.message))
    ).toBe(true);
  });
});
