// State-machine ModelTypeDefinition — the plug-in registration entry
// for the original (and so far only) supported model type.
//
// Only the v7.5 step-2 fields are populated for now (id, label,
// description, analysisTabs). Later steps add parse / diff / grammar /
// preamble / external-services registration — those pieces already
// exist in this directory and can be surfaced here without breaking
// the current shape.

import type { ModelTypeDefinition } from '../types';
import { stateMachineAnalysisTabs } from './analysisTabs';

export const stateMachineDefinition: ModelTypeDefinition = {
  id: 'state-machine',
  label: 'State machine',
  description:
    'UML-style state transition diagram (PlantUML subset, ADR-009). Nswitch-coverage test cases and canonical transition-table CSV.',
  analysisTabs: stateMachineAnalysisTabs,
};
