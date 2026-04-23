import { describe, it, expect } from 'vitest';
import {
  insertHideMarker,
  removeHideMarker,
  markDeleted,
  unmarkDeleted,
  insertNoteMarker,
  removeNoteMarkers,
  insertBeforeEnduml,
} from '../../src/modelTypes/requirement/sourceEdit';

describe('requirement source-edit helpers (ADR-014 v2 redesign)', () => {
  describe('insertBeforeEnduml', () => {
    it('inserts before the @enduml line', () => {
      const out = insertBeforeEnduml(
        '@startuml\n$fReq("R1", "foo")\n@enduml\n',
        `' @modellogue hide "R1"`
      );
      expect(out).toBe(
        `@startuml\n$fReq("R1", "foo")\n' @modellogue hide "R1"\n@enduml\n`
      );
    });
  });

  describe('hide marker', () => {
    it('insertHideMarker adds one `\' @modellogue hide` line', () => {
      const out = insertHideMarker(
        '@startuml\n$fReq("R1", "x")\n@enduml\n',
        'R1'
      );
      expect(out).toContain(`' @modellogue hide "R1"`);
    });

    it('insertHideMarker is idempotent', () => {
      const s1 = insertHideMarker(
        '@startuml\n$fReq("R1", "x")\n@enduml\n',
        'R1'
      );
      expect(insertHideMarker(s1, 'R1')).toBe(s1);
    });

    it('removeHideMarker drops the matching line', () => {
      const src = `@startuml
$fReq("R1", "x")
' @modellogue hide "R1"
' @modellogue hide "R2"
@enduml
`;
      const out = removeHideMarker(src, 'R1');
      expect(out).not.toContain(`' @modellogue hide "R1"`);
      expect(out).toContain(`' @modellogue hide "R2"`);
    });

    it('hide marker does NOT modify the declaration (unlike delete)', () => {
      const src = `@startuml\n$fReq("R1", "x")\n@enduml\n`;
      const out = insertHideMarker(src, 'R1');
      // Source fed directly to PlantUML would still render R1.
      expect(out).toContain('$fReq("R1", "x")');
    });
  });

  describe('delete block', () => {
    it('markDeleted comments the declaration, tags touching relations, and inserts the marker', () => {
      const src = `@startuml
$fReq("R1", "root")
$fReq("R2", "gone")
$derive("R1", "R2")
$contain("R2", "R3")
@enduml`;
      const out = markDeleted(src, 'R2', 'out of scope');
      // marker precedes the declaration
      expect(out).toContain(`' @modellogue deleted "R2" "out of scope"`);
      expect(out).toMatch(/deleted "R2" "out of scope"\n' \$fReq\("R2"/);
      // relations touching R2 are commented AND tagged
      expect(out).toContain(
        `' $derive("R1", "R2") ' @modellogue deleted-side "R2"`
      );
      expect(out).toContain(
        `' $contain("R2", "R3") ' @modellogue deleted-side "R2"`
      );
      // R1's declaration and unrelated relations are untouched
      expect(out).toContain(`$fReq("R1", "root")`);
    });

    it('markDeleted is idempotent', () => {
      const src = `@startuml\n$fReq("R1", "x")\n@enduml\n`;
      const s1 = markDeleted(src, 'R1', 'reason');
      const s2 = markDeleted(s1, 'R1', 'reason');
      expect(s2).toBe(s1);
    });

    it('markDeleted returns source unchanged when the id is not declared', () => {
      const src = `@startuml\n$fReq("R1", "x")\n@enduml\n`;
      expect(markDeleted(src, 'R99', 'anything')).toBe(src);
    });

    it('markDeleted escapes quotes inside the reason', () => {
      const src = `@startuml\n$fReq("R1", "x")\n@enduml\n`;
      const out = markDeleted(src, 'R1', 'reason "with" quotes');
      expect(out).toContain(
        `' @modellogue deleted "R1" "reason \\"with\\" quotes"`
      );
    });

    it('unmarkDeleted restores the declaration and tagged relations', () => {
      const src = `@startuml
$fReq("R1", "root")
$fReq("R2", "gone")
$derive("R1", "R2")
@enduml`;
      const deleted = markDeleted(src, 'R2', 'out of scope');
      const restored = unmarkDeleted(deleted, 'R2');
      // Marker gone
      expect(restored).not.toContain(`' @modellogue deleted "R2"`);
      // Declaration uncommented
      expect(restored).toContain(`$fReq("R2", "gone")`);
      expect(restored).not.toContain(`' $fReq("R2", "gone")`);
      // Relation uncommented and tag stripped
      expect(restored).toContain(`$derive("R1", "R2")`);
      expect(restored).not.toContain('deleted-side');
    });

    it('round-trip: mark then unmark restores the original', () => {
      const src = `@startuml
$fReq("R1", "a")
$fReq("R2", "b")
$derive("R1", "R2")
@enduml`;
      const out = unmarkDeleted(markDeleted(src, 'R2', 'r'), 'R2');
      expect(out).toBe(src);
    });
  });

  describe('note marker', () => {
    it('insertNoteMarker adds a `\' @modellogue note` line', () => {
      const out = insertNoteMarker(
        '@startuml\n$fReq("R1", "x")\n@enduml\n',
        'R1',
        'please review'
      );
      expect(out).toContain(`' @modellogue note "R1" "please review"`);
    });

    it('removeNoteMarkers removes all matching note lines for the id', () => {
      const src = `@startuml
$fReq("R1", "x")
' @modellogue note "R1" "first"
' @modellogue note "R1" "second"
' @modellogue note "R2" "other"
@enduml
`;
      const out = removeNoteMarkers(src, 'R1');
      expect(out).not.toContain(`note "R1"`);
      expect(out).toContain(`' @modellogue note "R2" "other"`);
    });
  });
});
