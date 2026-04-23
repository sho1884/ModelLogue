// The !procedure preamble required to make requirement-diagram macro
// calls renderable by PlantUML Server (SR-115).
//
// Design principle (per user direction, 2026-04-23): the DSL must be
// a subset of PlantUML. A ModelLogue-authored source must render when
// fed directly to PlantUML Server without going through ModelLogue's
// pipeline. That means the preamble lives INSIDE the edit buffer, not
// injected at render time. New requirement sessions start from
// DEFAULT_REQUIREMENT_SEED_SOURCE below, so the user's buffer has the
// preamble from the first keystroke.
//
// Only the SysML-convention macros remain — no ModelLogue-specific
// additions. Review-state (hide / delete / note) is expressed in
// PlantUML comments (`' @modellogue ...`), not in invented macros.

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
!endprocedure`;

// Seed template used when a fresh requirement-diagram session starts.
// The edit buffer is initialized with this so the user's content is
// wrapped in a ready-to-render PlantUML source from the first keystroke.
// Save .puml / Save & finish therefore always produce a file that works
// when sent directly to PlantUML Server, with no ModelLogue round-trip
// required.
export const DEFAULT_REQUIREMENT_SEED_SOURCE: string = `@startuml

${INJECTED_PREAMBLE}

@enduml
`;

/**
 * Convenience: true when `source` contains the canonical preamble
 * verbatim. The parser itself tolerates any `!procedure` block layout,
 * so this helper is only for UI-level checks (e.g. "does this saved
 * file look like it came from ModelLogue?").
 */
export function hasPreamble(source: string): boolean {
  return source.includes(INJECTED_PREAMBLE);
}
