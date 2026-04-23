// Requirement ModelTypeDefinition (ADR-012 step 5).
// Registers parser, renderer, and the three analysis tabs with the
// model-type registry.

import type { GenericParseResult, ModelTypeDefinition } from '../types';
import { requirementAnalysisTabs } from './analysisTabs';
import { parse as parseRequirement } from './parser';
import { renderPlantUml as renderFromSource } from './renderer';
import { DEFAULT_REQUIREMENT_SEED_SOURCE } from './preamble';
import { parseRequirementsCsv } from './csvParser';
import { modelToPlantUml } from './plantUmlGenerator';
import type { RequirementModel } from './model';

function extractCsvBlock(text: string): string | null {
  const match = text.match(/```csv\s*\n([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

export const requirementDefinition: ModelTypeDefinition = {
  id: 'requirement',
  label: 'Requirement',
  description:
    'SysML-style requirement diagram (PlantUML-subset DSL with !procedure preamble). Review-state expressed in PlantUML comments so the source renders directly on PlantUML Server without going through this tool.',
  analysisTabs: requirementAnalysisTabs,

  // New sessions start from the seed template so the edit buffer has
  // the preamble from the first keystroke (makes `Save .puml` always
  // produce a standalone-renderable file).
  defaultSeedSource: DEFAULT_REQUIREMENT_SEED_SOURCE,

  parse(source: string): GenericParseResult {
    const r = parseRequirement(source);
    return { model: r.model, errors: r.errors };
  },

  // Pass the source through, commenting out hidden requirement
  // declarations and their relations. Deleted requirements are already
  // commented-out in the source — no renderer action needed.
  renderPlantUml(source: string, model: unknown | null): string {
    return renderFromSource(source, (model as RequirementModel | null) ?? null);
  },

  // v7.5: AI exchanges requirements as CSV (the list is canonical; the
  // diagram is a visualization derived mechanically from the list).
  // Extract the ```csv block, parse into a model, regenerate canonical
  // PlantUML (preamble + macros + review-state comments).
  extractSuggestedSource(aiText: string): string | null {
    const csv = extractCsvBlock(aiText);
    if (!csv) return null;
    const parsed = parseRequirementsCsv(csv);
    if (!parsed.model || parsed.errors.length > 0) return null;
    return modelToPlantUml(parsed.model);
  },
};
