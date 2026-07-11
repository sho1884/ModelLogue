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

  /**
   * Optional model-level diff for the before/after proposal view
   * (SR-033). State-machine returns its ModelDiff shape; requirement
   * leaves this undefined in v7.5, which makes ProposalView render the
   * before/after SVGs without colored overlays (Step 6). Consumers
   * cast the return type based on the known model type id.
   */
  diff?: (before: unknown, after: unknown) => unknown;

  /**
   * Optional seed text for the edit buffer when a fresh session of
   * this type starts. Requirement sessions use it to pre-populate the
   * `!procedure` preamble so the buffer is a valid PlantUML source
   * from the first keystroke. State-machine sessions leave it
   * undefined — the buffer stays empty and the user types raw
   * PlantUML.
   */
  defaultSeedSource?: string;

  /**
   * Build the chat message that the "Generate Model" shortcut sends
   * (SR-082). Each type nudges the AI toward ITS OWN canonical reply
   * format — state-machine asks for a state diagram in a ```plantuml
   * block, process for an activity diagram in a ```plantuml block, and
   * requirement for an SR-113 ```csv block. Keeping this per-type is
   * what stops "Generate Model" in a requirement / process session from
   * asking the AI for a state diagram (the old hard-coded prefix).
   *
   * The return value is the FULL user message: the type-specific
   * instruction followed by the requirements text.
   */
  buildGenerateModelPrompt: (requirementsText: string) => string;

  /**
   * Extract and transform an AI chat reply into the canonical PlantUML
   * source for this model type (v7.5). The return value, if any, is
   * stored as ChatMessage.suggestedSource and becomes the new session
   * source on apply.
   *
   * - state-machine: finds a ```plantuml code block and returns its
   *   contents verbatim (PlantUML IS the canonical form).
   * - requirement: finds a ```csv code block, parses SR-113 CSV, and
   *   regenerates the canonical PlantUML (preamble + macro calls +
   *   review-state comments). The AI works in CSV space so we can feed
   *   it the list directly (the list is the canonical data; the diagram
   *   is a visualization) and regenerate PlantUML mechanically.
   *
   * `currentSource` is passed for future type-specific merging (e.g.
   * preserving a custom preamble); current implementations ignore it.
   *
   * Returns null if no usable payload is present.
   */
  extractSuggestedSource: (
    aiText: string,
    currentSource: string
  ) => string | null;

  /**
   * Extract on-diagram coordinates for the model's elements from the
   * PlantUML-generated SVG. Drives marker placement (SR-022 for
   * state-machine; v7.5 auto-markers for requirement). Implementations
   * return an empty map when the SVG doesn't match the expected shape —
   * missing coordinates just mean "no marker placement for this
   * element", not a fatal error.
   *
   * Called in a browser context; happy-dom is enough for unit tests.
   */
  extractCoordinates: (
    svgString: string,
    model: unknown
  ) => Map<string, { x: number; y: number; width: number; height: number }>;
}
