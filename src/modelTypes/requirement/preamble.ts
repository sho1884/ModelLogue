// SR-115: the fixed `!procedure` preamble that ModelLogue injects into
// every requirement-diagram source before handing it to PlantUML Server.
//
// Users don't see this block in the editor buffer — they see just the
// content (macro calls, packages, meta macros). Save .puml writes a
// self-contained file with the preamble included; Open detects the
// canned block and strips it before populating the editor.
//
// The preamble defines the class-diagram-based stereotypes that
// visualize each requirement kind and each relation kind. Keeping it
// canned (not user-editable) makes round-tripping deterministic and
// keeps the parser's job simple — the parser skips every line from
// `!procedure` to its `!endprocedure` regardless of content, so small
// preamble variations don't break parsing.
//
// The block below intentionally does NOT include `@startuml` /
// `@enduml`, since those belong to the user's content. Rendering
// inserts the block right after the `@startuml` line.

export const INJECTED_PREAMBLE = `hide circle
hide empty members
hide method

!procedure $req($id, $name)
    class "$name" as $id <<requirement>> #White {
    id = "$id"
    }
!endprocedure

!procedure $req($id, $name, $txt)
    class "$name" as $id <<requirement>> #White {
    id = "$id"
    text = "$txt"
    }
!endprocedure

!procedure $fReq($id, $name)
    class "$name" as $id <<functionalRequirement>> {
    id = "$id"
    }
!endprocedure

!procedure $fReq($id, $name, $txt)
    class "$name" as $id <<functionalRequirement>> {
    id = "$id"
    text = "$txt"
    }
!endprocedure

!procedure $nfReq($id, $name)
    class "$name" as $id <<Non-functionalRequirement>> #PaleGreen {
    id = "$id"
    }
!endprocedure

!procedure $nfReq($id, $name, $txt)
    class "$name" as $id <<Non-functionalRequirement>> #PaleGreen {
    id = "$id"
    text = "$txt"
    }
!endprocedure

!procedure $dConstraint($id, $name)
    class "$name" as $id <<designConstraint>> #PaleTurquoise {
    id = "$id"
    }
!endprocedure

!procedure $dConstraint($id, $name, $txt)
    class "$name" as $id <<designConstraint>> #PaleTurquoise {
    id = "$id"
    text = "$txt"
    }
!endprocedure

!procedure $contain($Parent, $Child)
    $Parent +-- $Child
!endprocedure

!procedure $derive($Supplier, $Client)
    $Supplier <.. $Client : <<deriveReqt>>
!endprocedure

!procedure $refine($Client, $NamedElement)
    $Client <.. $NamedElement : <<refine>>
!endprocedure

!procedure $satisfy($Req, $Design)
    $Req <.. $Design : <<satisfy>>
!endprocedure

!procedure $verify($Req, $Test)
    $Req <.. $Test : <<verify>>
!endprocedure

!procedure $trace($A, $B)
    $A <.. $B : <<trace>>
!endprocedure

!procedure $copy($Original, $Copy)
    $Original <.. $Copy : <<copy>>
!endprocedure

' Review-state meta macros (ADR-014) — no PlantUML output; parsed by
' ModelLogue to drive hide / delete / note UI state.
!procedure $hide($id)
!endprocedure
!procedure $deleted($id, $reason)
!endprocedure
!procedure $note($id, $text)
!endprocedure`;

/**
 * Heuristically detect whether `source` starts with (or contains) the
 * canned preamble block. True ⇒ `stripPreamble` will cleanly remove it.
 */
export function matchesPreamble(source: string): boolean {
  return source.includes(INJECTED_PREAMBLE);
}

/**
 * Remove the canned preamble from `source` if present verbatim. If the
 * user hand-tweaked the preamble, this returns the source unchanged —
 * we never try to guess which `!procedure` block is "ours".
 */
export function stripPreamble(source: string): string {
  if (!matchesPreamble(source)) return source;
  // Remove the block plus one trailing newline so we don't leave a
  // blank line where the preamble used to be.
  return source.replace(INJECTED_PREAMBLE + '\n', '').replace(INJECTED_PREAMBLE, '');
}

/**
 * Insert the canned preamble right after the first `@startuml` line in
 * `source`. If `@startuml` is absent, the preamble is prepended. If
 * the preamble is already present, `source` is returned unchanged.
 */
export function injectPreamble(source: string): string {
  if (matchesPreamble(source)) return source;

  const startIdx = source.indexOf('@startuml');
  if (startIdx < 0) {
    return INJECTED_PREAMBLE + '\n' + source;
  }
  // Find the end of the @startuml line.
  const lineEnd = source.indexOf('\n', startIdx);
  if (lineEnd < 0) {
    // @startuml is the only (or last) line; just append preamble after.
    return source + '\n' + INJECTED_PREAMBLE + '\n';
  }
  return (
    source.slice(0, lineEnd + 1) +
    INJECTED_PREAMBLE +
    '\n' +
    source.slice(lineEnd + 1)
  );
}
