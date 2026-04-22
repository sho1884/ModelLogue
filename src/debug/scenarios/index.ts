import type { Scenario } from './types';
import sizeAspect from './01-size-aspect';
import addRemoveChange from './02-add-remove-change';
import compositeAndReask from './03-composite-and-reask';
import nswitchLevels from './04-nswitch-levels';
import unreachableWithinCap from './05-unreachable-within-cap';
import compositeLayers from './06-composite-layers';
import mainloopCycleClosure from './07-mainloop-cycle-closure';

// Registry ordered for the runner dropdown. Add new scenario files
// here (and create one file per scenario under this folder).
//
// 01-03: UX verification (diagram / proposal / reask).
// 04-07: nswitch / Test cases tab exploration (SR-102 / SR-103).
export const SCENARIOS: Scenario[] = [
  sizeAspect,
  addRemoveChange,
  compositeAndReask,
  nswitchLevels,
  unreachableWithinCap,
  compositeLayers,
  mainloopCycleClosure,
];

export type { Scenario, ScenarioStep } from './types';
