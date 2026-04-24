// Model-type registry (ADR-012).
//
// All registered ModelTypeDefinitions live here. Adding a new model
// type is a single-line edit once the type's folder exists:
//   import { myThingDefinition } from './my-thing/definition';
//   export const MODEL_TYPE_REGISTRY = [stateMachineDefinition, myThingDefinition];
//
// Consumers (AnalysisPanel, the future model-type selector, etc.)
// never import a specific definition — they go through this registry
// so a third / fourth type surfaces without touching call sites.

import type { ModelTypeDefinition } from './types';
import { stateMachineDefinition } from './state-machine/definition';
import { requirementDefinition } from './requirement/definition';
import { processDefinition } from './process/definition';

export const MODEL_TYPE_REGISTRY: ReadonlyArray<ModelTypeDefinition> = [
  stateMachineDefinition,
  requirementDefinition,
  processDefinition,
];

/**
 * Default model type applied to sessions that do not carry an explicit
 * `modelTypeId` (pre-v7.5 saved bundles, new sessions before the
 * selector is shown). Matches the only type ModelLogue supported
 * through v7.4.
 */
export const DEFAULT_MODEL_TYPE_ID = 'state-machine';

export function getModelTypeDefinition(id: string): ModelTypeDefinition | null {
  return MODEL_TYPE_REGISTRY.find((d) => d.id === id) ?? null;
}

export function getDefaultModelTypeDefinition(): ModelTypeDefinition {
  const def = getModelTypeDefinition(DEFAULT_MODEL_TYPE_ID);
  if (!def) {
    // Registry is hand-maintained and must include the default; if it
    // doesn't, that's a build-time bug worth crashing early.
    throw new Error(
      `Model type registry is missing the default type "${DEFAULT_MODEL_TYPE_ID}"`
    );
  }
  return def;
}
