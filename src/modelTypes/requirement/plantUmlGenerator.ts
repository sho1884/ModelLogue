// Generate canonical PlantUML (macro form + preamble + review-state
// comments) from a RequirementModel. The inverse direction of parser.ts
// for the macro form.
//
// Used by the AI-apply pipeline: when the AI returns a CSV payload
// (SR-113 shape), the CSV is parsed into a RequirementModel and this
// generator regenerates the PlantUML buffer that PlantUML Server will
// render. The buffer therefore stays within the PlantUML subset (no
// ModelLogue-invented macros) and remains renderable without going
// through ModelLogue.
//
// Deterministic: same model ⇒ byte-identical output (ADR-011).

import type {
  Requirement,
  RequirementModel,
  RequirementRelation,
} from './model';
import { INJECTED_PREAMBLE } from './preamble';

const MACRO_BY_TYPE: Record<Requirement['type'], string> = {
  requirement: '$req',
  functionalRequirement: '$fReq',
  nonFunctionalRequirement: '$nfReq',
  designConstraint: '$dConstraint',
};

const MACRO_BY_RELATION: Record<RequirementRelation['kind'], string> = {
  contain: '$contain',
  derive: '$derive',
  refine: '$refine',
  satisfy: '$satisfy',
  verify: '$verify',
  trace: '$trace',
  copy: '$copy',
};

function escapeArg(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function requirementMacroCall(r: Requirement): string {
  const macro = MACRO_BY_TYPE[r.type];
  const head = `${macro}("${escapeArg(r.id)}", "${escapeArg(r.statement)}"`;
  if (r.text !== null && r.text !== '') {
    return `${head}, "${escapeArg(r.text)}")`;
  }
  return `${head})`;
}

function relationMacroCall(rel: RequirementRelation): string {
  const macro = MACRO_BY_RELATION[rel.kind];
  return `${macro}("${escapeArg(rel.sourceId)}", "${escapeArg(rel.targetId)}")`;
}

export function modelToPlantUml(model: RequirementModel): string {
  const deletedIds = new Set(
    model.requirements.filter((r) => r.deleted).map((r) => r.id)
  );

  const lines: string[] = [];
  lines.push('@startuml');
  lines.push('');
  lines.push(INJECTED_PREAMBLE);
  lines.push('');

  for (const r of model.requirements) {
    const call = requirementMacroCall(r);
    if (r.deleted) {
      lines.push(
        `' @modellogue deleted "${escapeArg(r.id)}" "${escapeArg(r.note)}"`
      );
      lines.push(`' ${call}`);
    } else {
      lines.push(call);
    }
  }

  if (model.requirements.length > 0 && model.relations.length > 0) {
    lines.push('');
  }

  for (const rel of model.relations) {
    const call = relationMacroCall(rel);
    const touchedDeleted = deletedIds.has(rel.sourceId)
      ? rel.sourceId
      : deletedIds.has(rel.targetId)
        ? rel.targetId
        : null;
    if (touchedDeleted !== null) {
      lines.push(
        `' ${call} ' @modellogue deleted-side "${escapeArg(touchedDeleted)}"`
      );
    } else {
      lines.push(call);
    }
  }

  const decorations: string[] = [];
  for (const r of model.requirements) {
    if (r.hidden) {
      decorations.push(`' @modellogue hide "${escapeArg(r.id)}"`);
    }
    if (!r.deleted && r.note !== '') {
      decorations.push(
        `' @modellogue note "${escapeArg(r.id)}" "${escapeArg(r.note)}"`
      );
    }
  }
  if (decorations.length > 0) {
    lines.push('');
    lines.push(...decorations);
  }

  lines.push('');
  lines.push('@enduml');
  lines.push('');

  return lines.join('\n');
}
