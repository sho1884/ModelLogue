// Sanity check: ModelLogue's own requirement diagrams (user-level
// and system-level) parse cleanly through the requirement-diagram
// parser. Catches regressions where parser changes break the
// dogfood diagrams in Doc/requirements/diagrams/.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parse } from '../../src/modelTypes/requirement/parser';

describe('Doc/requirements/diagrams/ — dogfood parses cleanly', () => {
  it('user-level.puml: 15 URs, 3 derive relations, every UR is in a package', () => {
    const src = readFileSync(
      'Doc/requirements/diagrams/user-level.puml',
      'utf-8'
    );
    const r = parse(src);
    if (r.errors.length > 0) {
      throw new Error(
        'Parse errors:\n' +
          r.errors.map((e) => `  L${e.line}: ${e.message}`).join('\n')
      );
    }
    expect(r.model).not.toBeNull();
    expect(r.model!.requirements).toHaveLength(15);
    const deriveRels = r.model!.relations.filter((x) => x.kind === 'derive');
    expect(deriveRels).toHaveLength(3);
    // Every UR sits inside a package, so parentId is non-null.
    expect(
      r.model!.requirements.every((req) => req.parentId !== null)
    ).toBe(true);
  });

  it('system-level.puml: 50 SRs, no derive relations, every SR is in a package', () => {
    const src = readFileSync(
      'Doc/requirements/diagrams/system-level.puml',
      'utf-8'
    );
    const r = parse(src);
    if (r.errors.length > 0) {
      throw new Error(
        'Parse errors:\n' +
          r.errors.map((e) => `  L${e.line}: ${e.message}`).join('\n')
      );
    }
    expect(r.model).not.toBeNull();
    expect(r.model!.requirements).toHaveLength(50);
    const deriveRels = r.model!.relations.filter((x) => x.kind === 'derive');
    expect(deriveRels).toHaveLength(0);
    expect(
      r.model!.requirements.every((req) => req.parentId !== null)
    ).toBe(true);
  });
});
