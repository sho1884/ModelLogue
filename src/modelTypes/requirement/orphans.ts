// SR-112: Orphan-requirements analysis.
//
// Two kinds of orphans (ADR-013 scope — r-to-r relations only):
//
//   - no-incoming: requirement has no derive / contain / refine / copy
//     pointing at it. Likely top-level or dangling.
//   - no-outgoing: requirement has no relation of those kinds going out
//     of it. Likely an un-decomposed leaf.
//
// Hidden and deleted requirements are excluded from the analysis. The
// scope note follows ADR-013: satisfy / verify / trace are NOT counted
// as r-to-r relations for orphan detection — they connect a requirement
// to a design/test artifact, which is a separate review phase.

import type { Requirement, RequirementModel } from './model';

const R_TO_R_KINDS = new Set(['derive', 'contain', 'refine', 'copy']);

export interface OrphanReport {
  /** Requirements with no r-to-r relation pointing at them. */
  noIncoming: Requirement[];
  /** Requirements with no r-to-r relation going out of them. */
  noOutgoing: Requirement[];
  /** Requirements that are both — fully isolated. */
  isolated: Requirement[];
}

export function findOrphans(model: RequirementModel): OrphanReport {
  const active = model.requirements.filter((r) => !r.hidden && !r.deleted);
  const activeIdSet = new Set(active.map((r) => r.id));

  const incomingTo = new Set<string>();
  const outgoingFrom = new Set<string>();

  for (const rel of model.relations) {
    if (!R_TO_R_KINDS.has(rel.kind)) continue;
    if (!activeIdSet.has(rel.sourceId)) continue;
    if (!activeIdSet.has(rel.targetId)) continue;
    outgoingFrom.add(rel.sourceId);
    incomingTo.add(rel.targetId);
  }

  // parentId counts as an incoming contain from the parent, when the
  // parent is also an active requirement.
  for (const r of active) {
    if (r.parentId && activeIdSet.has(r.parentId)) {
      incomingTo.add(r.id);
      outgoingFrom.add(r.parentId);
    }
  }

  const noIncoming = active.filter((r) => !incomingTo.has(r.id));
  const noOutgoing = active.filter((r) => !outgoingFrom.has(r.id));
  const isolated = active.filter(
    (r) => !incomingTo.has(r.id) && !outgoingFrom.has(r.id)
  );

  return { noIncoming, noOutgoing, isolated };
}
