// SR-114: prepare the PlantUML source that ModelLogue sends to
// PlantUML Server for a requirement-diagram session (2026-04-23
// redesign).
//
// Core principle: the edit buffer is already a valid PlantUML source
// (it carries the preamble from the session seed and review-state is
// expressed in PlantUML comments). Rendering is therefore a small
// line-level transform, not a regeneration from the model:
//
//   - Delete is already baked into the source (declaration commented
//     out, relations tagged with `' @modellogue deleted-side "id"`) —
//     no renderer action needed; PlantUML sees nothing for deleted ids.
//   - Hide is expressed as a comment marker only (declaration left
//     uncommented). The renderer comments out the declaration lines
//     and any relation lines touching hidden ids BEFORE sending to
//     PlantUML Server. The stored edit buffer is untouched.
//
// The function is a pure string → string (plus the model for knowing
// which ids are hidden). Deterministic: same input ⇒ byte-identical
// output (ADR-011).

import type { RequirementModel } from './model';

const REQ_DECL_RE =
  /^(\s*)(\$(?:req|fReq|nfReq|dConstraint))\s*\(\s*"([^"]+)"\s*,/;
const RELATION_RE =
  /^(\s*)\$(?:contain|derive|refine|satisfy|verify|trace|copy)\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/;

function commentOut(line: string): string {
  const m = line.match(/^(\s*)(\S.*)$/);
  if (!m) return line;
  const [, leading, rest] = m;
  // Don't re-comment an already-commented line.
  if (rest.startsWith("'")) return line;
  return `${leading}' ${rest}`;
}

export function renderPlantUml(
  source: string,
  model: RequirementModel | null
): string {
  if (!model) return source;
  const hiddenIds = new Set(
    model.requirements.filter((r) => r.hidden).map((r) => r.id)
  );
  if (hiddenIds.size === 0) return source;

  return source
    .split('\n')
    .map((line) => {
      const decl = line.match(REQ_DECL_RE);
      if (decl && hiddenIds.has(decl[3])) {
        return commentOut(line);
      }
      const rel = line.match(RELATION_RE);
      if (rel && (hiddenIds.has(rel[2]) || hiddenIds.has(rel[3]))) {
        return commentOut(line);
      }
      return line;
    })
    .join('\n');
}
