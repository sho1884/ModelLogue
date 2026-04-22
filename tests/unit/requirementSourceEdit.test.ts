import { describe, it, expect } from 'vitest';
import {
  ensureHideLine,
  removeHideLine,
  ensureDeletedLine,
  removeDeletedLine,
  insertBeforeEnduml,
} from '../../src/modelTypes/requirement/sourceEdit';

describe('requirement source-edit helpers (Step 6)', () => {
  describe('insertBeforeEnduml', () => {
    it('inserts before the @enduml line', () => {
      const out = insertBeforeEnduml(
        '@startuml\n$fReq("R1", "foo")\n@enduml\n',
        '$hide("R1")'
      );
      expect(out).toBe(
        '@startuml\n$fReq("R1", "foo")\n$hide("R1")\n@enduml\n'
      );
    });

    it('appends with a newline when @enduml is absent', () => {
      const out = insertBeforeEnduml('', '$hide("R1")');
      expect(out).toBe('$hide("R1")\n');
    });
  });

  describe('ensureHideLine / removeHideLine', () => {
    it('adds exactly one line for a given id', () => {
      const s1 = ensureHideLine(
        '@startuml\n$fReq("R1", "x")\n@enduml\n',
        'R1'
      );
      expect(s1).toContain('$hide("R1")');
      // Idempotent — second call is a no-op.
      const s2 = ensureHideLine(s1, 'R1');
      expect(s2).toBe(s1);
    });

    it('removes matching hide line and leaves others intact', () => {
      const src = `@startuml
$fReq("R1", "x")
$hide("R1")
$hide("R2")
@enduml
`;
      const out = removeHideLine(src, 'R1');
      expect(out).not.toContain('$hide("R1")');
      expect(out).toContain('$hide("R2")');
    });

    it('escapes regex metacharacters in the id (defensive)', () => {
      const id = 'R.1[0]';
      const s1 = ensureHideLine('@startuml\n@enduml\n', id);
      expect(s1).toContain(`$hide("${id}")`);
      const s2 = removeHideLine(s1, id);
      expect(s2).not.toContain('$hide');
    });
  });

  describe('ensureDeletedLine / removeDeletedLine', () => {
    it('adds a deleted line with the reason', () => {
      const out = ensureDeletedLine(
        '@startuml\n$fReq("R1", "x")\n@enduml\n',
        'R1',
        'out of scope'
      );
      expect(out).toContain('$deleted("R1", "out of scope")');
    });

    it('escapes embedded quotes in the reason', () => {
      const out = ensureDeletedLine(
        '@startuml\n@enduml\n',
        'R1',
        'reason with "quote"'
      );
      expect(out).toContain(
        '$deleted("R1", "reason with \\"quote\\"")'
      );
    });

    it('replaces any existing $deleted line for that id', () => {
      const src = `@startuml
$deleted("R1", "old reason")
@enduml
`;
      const out = ensureDeletedLine(src, 'R1', 'new reason');
      // Only one $deleted line, with the new reason
      const matches = out.match(/\$deleted\("R1"/g) ?? [];
      expect(matches.length).toBe(1);
      expect(out).toContain('"new reason"');
      expect(out).not.toContain('"old reason"');
    });

    it('removeDeletedLine drops the line regardless of reason content', () => {
      const src = `@startuml
$deleted("R1", "complex, reason")
$deleted("R2", "other")
@enduml
`;
      const out = removeDeletedLine(src, 'R1');
      expect(out).not.toContain('$deleted("R1"');
      expect(out).toContain('$deleted("R2"');
    });
  });
});
