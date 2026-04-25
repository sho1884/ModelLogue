// Process ModelTypeDefinition (UR-015, ADR-012, v7.6).
//
// Wires parser, source pass-through renderer, and placeholder analysis
// tabs into the model-type registry. PlantUML activity is used natively
// (no macro DSL), and AI exchange is PlantUML — same as state-machine,
// not CSV-based like requirement (§3.15.5).

import type { GenericParseResult, ModelTypeDefinition } from '../types';
import { processAnalysisTabs } from './analysisTabs';
import { parse as parseProcess } from './parser';
import { DEFAULT_PROCESS_SEED_SOURCE } from './preamble';
import { extractPlantUmlBlock } from '../../services/n8nService';
import { extractProcessCoordinates } from './svgCoordinates';
import type { ProcessModel } from './model';

export const processDefinition: ModelTypeDefinition = {
  id: 'process',
  label: 'Process (business workflow)',
  description:
    'レビュー向けプロセス図。BPMN とアクティビティ図を区別せず、両者の共通部分に絞った PlantUML activity サブセットを扱う。Scenarios タブが E2E / UAT テストケースの基礎になる (UR-015 / §3.15)。',
  analysisTabs: processAnalysisTabs,

  defaultSeedSource: DEFAULT_PROCESS_SEED_SOURCE,

  parse(source: string): GenericParseResult {
    const r = parseProcess(source);
    return { model: r.model, errors: r.errors };
  },

  // PlantUML activity IS canonical for this type (same as state-machine).
  // No render-time transformation; the buffer is what PlantUML Server sees.
  renderPlantUml(source: string): string {
    return source;
  },

  // AI replies carry a ```plantuml block. PlantUML is the canonical
  // form — unlike the requirement type, we do NOT exchange CSV here.
  extractSuggestedSource(aiText: string): string | null {
    return extractPlantUmlBlock(aiText) ?? null;
  },

  extractCoordinates(svgString: string, model: unknown) {
    return extractProcessCoordinates(svgString, model as ProcessModel);
  },
};
