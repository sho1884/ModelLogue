// Re-export shim (ADR-012 §17.8 step 1).
//
// The canonical-CSV serializer is state-machine-specific and now lives
// at `src/modelTypes/state-machine/transitionTableSerializer.ts`.
// Removal scheduled for v7.6.

export * from '../modelTypes/state-machine/transitionTableSerializer';
