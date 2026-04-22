// Re-export shim (ADR-012 §17.8 step 1).
//
// The state-machine model lives at `src/modelTypes/state-machine/model.ts`.
// This file exists so existing imports of `../types/stateMachine` keep
// working during the migration. New code should import from
// `src/modelTypes/state-machine`.
// Removal scheduled for v7.6.

export * from '../modelTypes/state-machine/model';
