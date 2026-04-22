// State-machine model type — barrel export (ADR-012).
//
// Callers should prefer importing from this barrel path:
//   import { parse, ... } from 'src/modelTypes/state-machine';
// The legacy paths under src/parsers/, src/engines/, src/types/ are
// kept as re-export shims during v7.5 for backward compatibility; they
// will be removed in v7.6.

export * from './model';
export * from './parseResult';
export * from './parser';
export * from './matrixGenerator';
export * from './transitionTableSerializer';
export * from './diff';
