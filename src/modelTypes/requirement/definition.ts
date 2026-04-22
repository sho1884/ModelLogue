// Requirement ModelTypeDefinition (ADR-012 step 5).
// Registers parser, renderer, and the three analysis tabs with the
// model-type registry.

import type { GenericParseResult, ModelTypeDefinition } from '../types';
import { requirementAnalysisTabs } from './analysisTabs';
import { parse as parseRequirement } from './parser';
import { renderPlantUml as renderFromModel } from './renderer';
import type { RequirementModel } from './model';

export const requirementDefinition: ModelTypeDefinition = {
  id: 'requirement',
  label: 'Requirement',
  description:
    'SysML-style requirement diagram (macro DSL + seed form per ADR-013/014). Requirement list + traceability matrix + orphan report.',
  analysisTabs: requirementAnalysisTabs,

  parse(source: string): GenericParseResult {
    const r = parseRequirement(source);
    return { model: r.model, errors: r.errors };
  },

  // Filter hidden/deleted and prepend the preamble for PlantUML Server.
  // If we don't have a parsed model yet (first render), fall back to
  // passing the source through so the server shows what it can.
  renderPlantUml(source: string, model: unknown | null): string {
    if (!model) return source;
    return renderFromModel(model as RequirementModel);
  },
};
