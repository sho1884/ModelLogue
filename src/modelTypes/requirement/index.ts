// Requirement model type — barrel export (ADR-012).

export * from './model';
export * from './parseResult';
export { parse } from './parser';
export {
  INJECTED_PREAMBLE,
  DEFAULT_REQUIREMENT_SEED_SOURCE,
  hasPreamble,
} from './preamble';
export { REQUIREMENT_DIAGRAM_GRAMMAR } from './grammar';
export { renderPlantUml } from './renderer';
export {
  modelToRequirementsCsv,
  modelToRequirementsHtml,
} from './listSerializer';
export {
  buildTraceabilityMatrix,
  type TraceabilityMatrix,
  type RelationKindAbbrev,
} from './traceability';
export { findOrphans, type OrphanReport } from './orphans';
export { requirementDefinition } from './definition';
