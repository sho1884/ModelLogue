// Re-export shim (ADR-012 §17.8 step 1).
//
// The state-machine parse result types live at
// `src/modelTypes/state-machine/parseResult.ts`. This file keeps the
// existing import path `../types/parser` working during migration.
// Removal scheduled for v7.6 (generalization to ParseResult<M> also
// planned then).

export * from '../modelTypes/state-machine/parseResult';
