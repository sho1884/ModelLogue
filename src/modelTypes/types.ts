// ModelTypeDefinition — the plug-in contract each supported model type
// fulfils (ADR-012).
//
// v7.5 step 2 introduces the MINIMUM fields required to drive the
// dynamic Analysis-panel tab set (SR-071). Later steps extend the
// interface with parse / diff / grammar / etc.:
//   - step 3: modelTypeId in session state (uses `id`)
//   - step 4: requirement parser registers its own definition
//   - step 5: the type-specific analysis tabs slot into AnalysisPanel
//             without touching the panel code
//
// Keeping this interface narrow for now lets each extension land as
// an additive change rather than a breaking one.

import type { ReactNode } from 'react';

/**
 * A single analysis-panel tab contributed by a model type.
 * The tab component is fully self-contained: it reaches into whichever
 * store it needs and returns its own UI. AnalysisPanel only decides
 * which tab is active and calls `render()`.
 */
export interface AnalysisTabSpec {
  /** Stable tab id, used by uiStore.activeAnalysisTab. */
  id: string;
  /** Label shown on the tab button. */
  label: string;
  /** Lazily rendered when the tab is active. */
  render: () => ReactNode;
}

/**
 * Generic parse-result shape. Each ModelTypeDefinition carries its own
 * instantiation with the type's concrete Model.
 */
export interface GenericParseError {
  line: number;
  message: string;
}
export interface GenericParseResult {
  model: unknown | null;
  errors: GenericParseError[];
}

/**
 * The public surface each model type plugin exposes to the SPA shell.
 */
export interface ModelTypeDefinition {
  /**
   * Stable id used in session state, the modelTypeId header selector,
   * and the registry lookup. Examples: 'state-machine', 'requirement'.
   */
  id: string;
  /** User-visible name shown in the model-type selector (SR-073). */
  label: string;
  /** One-line hint shown as a tooltip or secondary text near the selector. */
  description: string;
  /**
   * Type-specific analysis tabs appended after the common tabs
   * (Requirements | Source) in the Analysis panel.
   */
  analysisTabs: AnalysisTabSpec[];

  /**
   * Parse the canonical PlantUML / DSL source into this type's model.
   * Implementations return `model` as `unknown` because the registry is
   * type-erased; callers that know which type they're dealing with can
   * cast safely.
   */
  parse: (source: string) => GenericParseResult;

  /**
   * Transform the (source, parsed model) pair into the PlantUML that
   * goes to PlantUML Server. For state-machine this is identity; for
   * requirement it injects the preamble and filters hidden / deleted
   * requirements out (SR-114, SR-115).
   */
  renderPlantUml: (source: string, model: unknown | null) => string;
}
