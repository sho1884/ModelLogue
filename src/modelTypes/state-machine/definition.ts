// State-machine ModelTypeDefinition. Extended in step 5 with `parse`
// (existing state-machine parser wrapped to the generic shape) and
// `renderPlantUml` (identity — PlantUML source IS canonical for this
// type).

import type { GenericParseResult, ModelTypeDefinition } from '../types';
import { stateMachineAnalysisTabs } from './analysisTabs';
import { parse as parseStateMachine } from './parser';
import { diffModels } from './diff';
import type { StateMachineModel } from './model';

export const stateMachineDefinition: ModelTypeDefinition = {
  id: 'state-machine',
  label: 'State machine',
  description:
    'UML-style state transition diagram (PlantUML subset, ADR-009). Nswitch-coverage test cases and canonical transition-table CSV.',
  analysisTabs: stateMachineAnalysisTabs,

  parse(source: string): GenericParseResult {
    const r = parseStateMachine(source);
    return { model: r.model, errors: r.errors };
  },

  // PlantUML source IS canonical for state machines; no transform needed.
  renderPlantUml(source: string): string {
    return source;
  },

  // ProposalView uses this to build the colored add/remove/change overlay.
  // Requirement type leaves diff undefined, in which case ProposalView
  // falls back to side-by-side SVGs without an overlay.
  diff(before: unknown, after: unknown) {
    return diffModels(
      before as StateMachineModel,
      after as StateMachineModel
    );
  },
};
