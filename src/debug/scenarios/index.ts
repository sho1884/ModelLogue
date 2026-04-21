import type { Scenario } from './types';
import sizeAspect from './01-size-aspect';
import addRemoveChange from './02-add-remove-change';
import compositeAndReask from './03-composite-and-reask';

// Registry ordered for the runner dropdown. Add new scenario files
// here (and create one file per scenario under this folder).
export const SCENARIOS: Scenario[] = [
  sizeAspect,
  addRemoveChange,
  compositeAndReask,
];

export type { Scenario, ScenarioStep } from './types';
