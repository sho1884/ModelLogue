// Stash the pre-apply model so the next fetchCoordinates in modelStore
// can draw added/changed rectangles on the refreshed diagram. Shared
// between ChatPanel.handleApply (real apply) and
// ScenarioRunner.autoApplyLatestProposal (debug harness); both must
// apply the same gate logic so scenarios render the same way the live
// app does.
//
// Gates:
// - requirement sessions: stash only when the before-model has at
//   least one requirement. Initial generation (seed preamble, zero
//   requirements → first AI proposal with N requirements) would
//   otherwise mark every box green.
// - process sessions (v7.6): stash only when the before-model has
//   at least one task. Same "don't splatter green on first apply"
//   reasoning.
// - state-machine and all other types: clear the pending slot so
//   any stale requirement / process stash from a previous session
//   does not leak in.

import { useSessionStore } from './sessionStore';
import { useModelStore } from './modelStore';
import type { RequirementModel } from '../modelTypes/requirement/model';
import type { ProcessModel } from '../modelTypes/process/model';
import { walkProcessNodes } from '../modelTypes/process/model';

function processHasAnyTask(m: ProcessModel): boolean {
  let found = false;
  walkProcessNodes(m.rootBody, (n) => {
    if (n.kind === 'task') found = true;
  });
  return found;
}

export function stashAutoMarkerBeforeIfApplicable(): void {
  const modelTypeId = useSessionStore.getState().modelTypeId;
  const beforeModel = useModelStore.getState().model;

  if (modelTypeId === 'requirement') {
    const isRequirementShape =
      beforeModel && 'requirements' in (beforeModel as object);
    if (!isRequirementShape) {
      useModelStore.getState().setPendingAutoMarkerBefore(null);
      return;
    }
    const req = beforeModel as RequirementModel;
    if (req.requirements.length === 0) {
      useModelStore.getState().setPendingAutoMarkerBefore(null);
      return;
    }
    useModelStore.getState().setPendingAutoMarkerBefore(req);
    return;
  }

  if (modelTypeId === 'process') {
    const isProcessShape =
      beforeModel && 'rootBody' in (beforeModel as object);
    if (!isProcessShape) {
      useModelStore.getState().setPendingAutoMarkerBefore(null);
      return;
    }
    const proc = beforeModel as ProcessModel;
    if (!processHasAnyTask(proc)) {
      useModelStore.getState().setPendingAutoMarkerBefore(null);
      return;
    }
    useModelStore.getState().setPendingAutoMarkerBefore(proc);
    return;
  }

  // state-machine and anything else: do not stash.
  useModelStore.getState().setPendingAutoMarkerBefore(null);
}
