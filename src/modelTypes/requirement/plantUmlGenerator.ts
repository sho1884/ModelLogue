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
//
// Visual grouping (ADR-015 / SR-119): an optional `groupingAxis`
// parameter selects which classification axis projects onto
// `package "<value>" <<Frame>> { ... }` blocks. Choices:
//   - 'none'   — flat output, no packages
//   - 'type'   — partition by Requirement.type
//   - 'level'  — partition by Requirement.level (ADR-015)
//   - 'group'  — partition by Requirement.group (ADR-015)
// Default selection (when the parameter is omitted): use 'group' if
// any requirement has a non-null group; else 'level' if any has a
// non-null level; else 'none'. `type` is never auto-selected — it stays
// an explicit choice for the rare "stereotype-driven layout" case.
//
// No explicit layout direction directive (2026-04-29). The relation
// macros in preamble.ts emit `.up.>` arrows with an explicit `up`
// direction modifier, which pulls the supplier above the client per
// SysML convention. The `$contain` `+--` arrow places the parent
// (whole) above the child (part) without a modifier. Together these
// give a top-to-bottom orientation without us declaring a global
// `top to bottom direction` (which collapses each package into a
// single horizontal row). Verified against the 3-tier sample:
// hierarchies within each level + cross-tier derive arrows produce a
// readable vertically-stacked layout.

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

export type GroupingAxis = 'none' | 'type' | 'level' | 'group';

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

function axisValue(r: Requirement, axis: GroupingAxis): string | null {
  switch (axis) {
    case 'type':
      return r.type;
    case 'level':
      return r.level;
    case 'group':
      return r.group;
    case 'none':
      return null;
  }
}

function resolveAxis(
  model: RequirementModel,
  requested?: GroupingAxis
): GroupingAxis {
  if (requested && requested !== undefined) {
    return requested;
  }
  // Auto-select per ADR-015 / SR-119.
  if (model.requirements.some((r) => r.group !== null && r.group !== '')) {
    return 'group';
  }
  if (model.requirements.some((r) => r.level !== null)) {
    return 'level';
  }
  return 'none';
}

export function modelToPlantUml(
  model: RequirementModel,
  groupingAxis?: GroupingAxis
): string {
  const axis = resolveAxis(model, groupingAxis);

  const deletedIds = new Set(
    model.requirements.filter((r) => r.deleted).map((r) => r.id)
  );

  const lines: string[] = [];
  lines.push('@startuml');
  lines.push('');
  lines.push(INJECTED_PREAMBLE);
  lines.push('');

  // ---- Partition requirements by the chosen axis ----
  // Requirements whose axis value is null land in the "ungrouped" bucket
  // and are emitted at the top level (outside any package).
  const buckets = new Map<string, Requirement[]>();
  const ungrouped: Requirement[] = [];
  if (axis === 'none') {
    ungrouped.push(...model.requirements);
  } else {
    for (const r of model.requirements) {
      const v = axisValue(r, axis);
      if (v === null || v === '') {
        ungrouped.push(r);
        continue;
      }
      let bucket = buckets.get(v);
      if (!bucket) {
        bucket = [];
        buckets.set(v, bucket);
      }
      bucket.push(r);
    }
  }

  const willEmitPackages = buckets.size > 0;

  // Layout direction is conditional:
  //   - `left to right direction`: emitted for INVENTORY-style
  //     diagrams (axis = 'group' / 'type', no cross-tier derive
  //     arrows expected). Without it, default top-to-bottom direction
  //     would spread inventory packages horizontally; LR makes them
  //     stack vertically, which reads better.
  //   - No directive: emitted for CROSS-TIER diagrams (axis =
  //     'level'). The relation macros' `.up.>` modifier handles
  //     orientation, and adding LR here interferes with `.up.>` for
  //     large derive-arrow sets (the supplier ends up below the
  //     client instead of above).
  // Determined empirically against the project's own sample.csv,
  // urs.csv, srs.csv, and coverage.csv.
  if (willEmitPackages && axis !== 'level') {
    lines.push('left to right direction');
    lines.push('');
  }

  const emitRequirement = (r: Requirement, indent: string): void => {
    const call = requirementMacroCall(r);
    if (r.deleted) {
      lines.push(
        `${indent}' @modellogue deleted "${escapeArg(r.id)}" "${escapeArg(r.note)}"`
      );
      lines.push(`${indent}' ${call}`);
    } else {
      lines.push(`${indent}${call}`);
    }
  };

  // Ungrouped requirements first (top level), then one package per bucket
  // in first-appearance order.
  for (const r of ungrouped) {
    emitRequirement(r, '');
  }
  if (ungrouped.length > 0 && buckets.size > 0) {
    lines.push('');
  }
  let firstBucket = true;
  for (const [name, members] of buckets) {
    if (!firstBucket) {
      lines.push('');
    }
    firstBucket = false;
    lines.push(`package "${escapeArg(name)}" <<Frame>> {`);
    for (const r of members) {
      emitRequirement(r, '  ');
    }
    lines.push('}');
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
