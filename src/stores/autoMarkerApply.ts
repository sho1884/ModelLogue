// Stash the pre-apply requirement-model so the next fetchCoordinates
// in modelStore can draw added/changed rectangles on the refreshed
// diagram. Shared between ChatPanel.handleApply (real apply) and
// ScenarioRunner.autoApplyLatestProposal (debug harness); both must
// apply the same gate logic so scenarios render the same way the live
// app does.
//
// Gate: only stash for requirement-type sessions where the before model
// actually had requirements. Initial generation (seed preamble, zero
// requirements → first AI proposal with N requirements) would otherwise
// mark every box green, which drowns out the diff signal on subsequent
// applies.

import { useSessionStore } from './sessionStore';
import { useModelStore } from './modelStore';
import type { RequirementModel } from '../modelTypes/requirement/model';

export function stashAutoMarkerBeforeIfApplicable(): void {
  const modelTypeId = useSessionStore.getState().modelTypeId;
  if (modelTypeId !== 'requirement') {
    useModelStore.getState().setPendingAutoMarkerBefore(null);
    return;
  }
  const beforeModel = useModelStore.getState().model;
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
}
