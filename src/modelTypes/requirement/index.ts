// Requirement model type — barrel export (ADR-012).
//
// Step 4 delivers model / parser / preamble. Step 5 adds definition
// (ModelTypeDefinition) with analysisTabs, renderer, and registration
// into the main registry.

export * from './model';
export * from './parseResult';
export { parse } from './parser';
export {
  INJECTED_PREAMBLE,
  matchesPreamble,
  stripPreamble,
  injectPreamble,
} from './preamble';
export { REQUIREMENT_DIAGRAM_GRAMMAR } from './grammar';
