// Re-export shim (ADR-012 §17.8 step 1).
//
// The matrix generator is state-machine-specific and now lives at
// `src/modelTypes/state-machine/matrixGenerator.ts`. This file keeps
// existing imports of `../engines/matrixGenerator` working during migration.
// Removal scheduled for v7.6.

export * from '../modelTypes/state-machine/matrixGenerator';
