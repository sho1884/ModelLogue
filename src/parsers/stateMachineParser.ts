// Re-export shim (ADR-012 §17.8 step 1).
//
// The state-machine parser lives at `src/modelTypes/state-machine/parser.ts`.
// This file keeps existing imports of `../parsers/stateMachineParser`
// working during migration.
// Removal scheduled for v7.6.

export * from '../modelTypes/state-machine/parser';
