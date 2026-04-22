// Re-export shim (ADR-012 §17.8 step 1).
//
// The state-machine model diff is state-machine-specific and now lives
// at `src/modelTypes/state-machine/diff.ts`. The original module name
// (`modelDiff`) is retained at the new location's re-export so the
// `diffModels` / `isDiffEmpty` / `ModelDiff` surface is unchanged.
// Removal scheduled for v7.6.

export * from '../modelTypes/state-machine/diff';
