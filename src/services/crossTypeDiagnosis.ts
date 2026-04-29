// SR-126 — cross-type parse diagnosis (Stage A of model-type
// auto-detection). When the active parser fails on a non-trivial
// source, try every other registered model type's parser and surface
// a "switch?" hint when exactly one alternative parses cleanly.
//
// Used by modelStore.parseSource. Returns null when no useful nudge
// is available — see acceptance criteria in system_requirements.yaml
// SR-126 for the precise discipline.

import { MODEL_TYPE_REGISTRY } from '../modelTypes/registry';

/** Minimum trimmed source length before diagnosis runs. Avoids
 *  pestering the user with "switch?" hints on near-empty input
 *  (defaults / placeholders / stubs). */
export const MIN_SOURCE_LENGTH_FOR_DIAGNOSIS = 30;

export interface ParseSuggestion {
  /** Active model type the user has selected. */
  activeTypeId: string;
  /** Parse-error count under the active type (always > 0 when this
   *  suggestion is returned). */
  activeErrorCount: number;
  /** Type id the user is being nudged to switch to. */
  suggestedTypeId: string;
  /** Parse-error count under the suggested type (always 0 when this
   *  suggestion is returned). */
  suggestedErrorCount: number;
}

/**
 * Heuristic check: does a parsed model carry enough structure that
 * the alternative parser is genuinely "fitting" the source vs just
 * accepting a degenerate input?
 *
 * The shapes vary across model types, so we look for any of the
 * fields known to populate when a model has real content. Conservative
 * — better to skip a borderline suggestion than push the user toward
 * an empty alternative.
 */
function modelHasContent(model: unknown): boolean {
  if (!model || typeof model !== 'object') return false;
  const m = model as Record<string, unknown>;
  // state-machine
  if (Array.isArray(m.states) && m.states.length > 0) return true;
  // requirement
  if (Array.isArray(m.requirements) && m.requirements.length > 0) {
    return true;
  }
  // process
  if (Array.isArray(m.rootBody) && m.rootBody.length > 0) return true;
  return false;
}

/**
 * Run all alternative parsers and surface a suggestion when exactly
 * one returns a clean parse with non-trivial content. Returns null
 * for every other case (no suggestion).
 *
 * Caller is expected to provide the active parse result so we don't
 * re-run the active parser here.
 */
export function diagnoseAlternativeTypes(
  source: string,
  activeTypeId: string,
  activeErrorCount: number
): ParseSuggestion | null {
  // Discipline #1: don't nudge when the active parser is happy.
  if (activeErrorCount === 0) return null;

  // Discipline #2: skip near-empty sources.
  if (source.trim().length < MIN_SOURCE_LENGTH_FOR_DIAGNOSIS) return null;

  // Run every other registered parser.
  const cleanCandidates: { typeId: string; errorCount: number }[] = [];
  for (const def of MODEL_TYPE_REGISTRY) {
    if (def.id === activeTypeId) continue;
    let result;
    try {
      result = def.parse(source);
    } catch {
      // A parser throwing is a bug in that parser, not the user's
      // problem. Treat as non-candidate.
      continue;
    }
    if (result.errors.length === 0 && modelHasContent(result.model)) {
      cleanCandidates.push({ typeId: def.id, errorCount: 0 });
    }
  }

  // Discipline #3: ambiguous (no candidates or multiple ties) — stay
  // silent rather than nudge toward an arbitrary one.
  if (cleanCandidates.length !== 1) return null;

  const winner = cleanCandidates[0];
  return {
    activeTypeId,
    activeErrorCount,
    suggestedTypeId: winner.typeId,
    suggestedErrorCount: winner.errorCount,
  };
}
