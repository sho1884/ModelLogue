// SR-130 — apply-time review-evidence guardrail.
//
// Defense-in-depth for ADR-014's soft-delete principle. When an AI csv
// reply silently drops a requirement id that was present in the
// previous model, the row's audit evidence vanishes. This module
// detects that situation so the apply pipeline can pause and ask the
// user to confirm before discarding the evidence.
//
// Design contract:
//   - "drop" means an id present in `beforeModel` but absent from
//     `newModel`. Row deletion via deleted=Y is NOT a drop — those
//     rows still carry the id (just flagged) and remain visible in
//     the Requirement list tab as evidence.
//   - The function is a pure id-set diff. Statement text is included
//     in the result so the modal can show "R5 (light up the room)"
//     rather than just an opaque id list.
//   - Returns an empty array (not null) for the no-drop case so
//     callers can do `.length > 0` checks without a null guard.
//
// Per SR-130 acceptance criteria, the caller is expected to gate this
// check on (a) requirement-type session and (b) non-empty before-model.
// This function does not enforce those gates — they are session-level
// concerns, not part of the diff itself.

import type { RequirementModel } from './model';

export interface DroppedRequirement {
  id: string;
  statement: string;
}

/**
 * Return the (id, statement) pairs that exist in `beforeModel` but are
 * missing from `newModel`. An empty array means no silent drops.
 *
 * `beforeModel` may be null (initial generation) — in that case there
 * is nothing to drop and the result is empty.
 */
export function detectDroppedRequirementIds(
  beforeModel: RequirementModel | null,
  newModel: RequirementModel | null
): DroppedRequirement[] {
  if (!beforeModel || beforeModel.requirements.length === 0) return [];
  if (!newModel) {
    // Couldn't parse the new csv at all — every previous id is "missing"
    // from the new state. Surface the full list so the user is warned
    // that applying would lose everything. (In practice the apply
    // pipeline should bail out earlier if the new csv didn't parse, so
    // this branch rarely fires.)
    return beforeModel.requirements.map((r) => ({
      id: r.id,
      statement: r.statement,
    }));
  }
  const newIds = new Set(newModel.requirements.map((r) => r.id));
  return beforeModel.requirements
    .filter((r) => !newIds.has(r.id))
    .map((r) => ({ id: r.id, statement: r.statement }));
}
