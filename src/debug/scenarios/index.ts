import type { Scenario } from './types';
import sizeAspect from './01-size-aspect';
import addRemoveChange from './02-add-remove-change';
import compositeAndReask from './03-composite-and-reask';
import nswitchLevels from './04-nswitch-levels';
import unreachable from './05-unreachable';
import compositeLayers from './06-composite-layers';
import mainloopCycleClosure from './07-mainloop-cycle-closure';
import requirementAddAndModify from './08-requirement-add-and-modify';
import requirementDecomposeAndMerge from './09-requirement-decompose-and-merge';
import processApplyBasics from './10-process-apply-basics';
import processRealisticReview from './11-process-realistic-review';

// Registry ordered for the runner dropdown. Add new scenario files
// here (and create one file per scenario under this folder).
//
// 01-03: state-machine UX verification (diagram / proposal / reask).
// 04-07: state-machine nswitch / Test cases tab (SR-102 / SR-103).
// 08-09: requirement-diagram apply path (CSV → PlantUML regen + auto-
//        markers, v7.5).
// 10+  : process-diagram apply path (PlantUML activity + Scenarios /
//        Events / Roles / Artifacts / Externals tabs, v7.6).
export const SCENARIOS: Scenario[] = [
  sizeAspect,
  addRemoveChange,
  compositeAndReask,
  nswitchLevels,
  unreachable,
  compositeLayers,
  mainloopCycleClosure,
  requirementAddAndModify,
  requirementDecomposeAndMerge,
  processApplyBasics,
  processRealisticReview,
];

export type { Scenario, ScenarioStep } from './types';
