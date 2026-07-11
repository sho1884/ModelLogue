// State-machine ModelTypeDefinition. Extended in step 5 with `parse`
// (existing state-machine parser wrapped to the generic shape) and
// `renderPlantUml` (identity — PlantUML source IS canonical for this
// type).

import type { GenericParseResult, ModelTypeDefinition } from '../types';
import { stateMachineAnalysisTabs } from './analysisTabs';
import { parse as parseStateMachine } from './parser';
import { diffModels } from './diff';
import type { StateMachineModel } from './model';
import { extractPlantUmlBlock } from '../../services/n8nService';
import { extractCoordinates as extractStateMachineCoordinates } from '../../engines/svgCoordinateExtractor';

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

  // "Generate Model" nudge (SR-082): ask for a state diagram in a
  // ```plantuml block — matches extractSuggestedSource and the n8n
  // state-machine system prompt.
  buildGenerateModelPrompt(requirementsText: string): string {
    return (
      'Generate a PlantUML state diagram (in the supported subset) that ' +
      'satisfies the following requirements. Return the source inside a ' +
      '```plantuml code block.\n\n---\n' +
      requirementsText
    );
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

  // AI replies for state-machine sessions carry a ```plantuml block that
  // IS the canonical source — just unwrap it.
  extractSuggestedSource(aiText: string): string | null {
    return extractPlantUmlBlock(aiText) ?? null;
  },

  extractCoordinates(svgString: string, model: unknown) {
    return extractStateMachineCoordinates(
      svgString,
      model as StateMachineModel
    );
  },
};
