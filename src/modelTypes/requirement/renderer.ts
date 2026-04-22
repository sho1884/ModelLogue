// SR-114: serialize a RequirementModel as a PlantUML source the
// PlantUML Server can render. Hidden and deleted requirements (and
// any relation touching them) are excluded. The fixed !procedure
// preamble is prepended so the Server has the macro definitions it
// needs (SR-115).
//
// The function is pure and deterministic (ADR-011): same input model
// always yields byte-identical output.

import { INJECTED_PREAMBLE } from './preamble';
import type {
  Requirement,
  RequirementModel,
  RequirementRelationKind,
  RequirementType,
} from './model';

const TYPE_TO_MACRO: Record<RequirementType, string> = {
  requirement: '$req',
  functionalRequirement: '$fReq',
  nonFunctionalRequirement: '$nfReq',
  designConstraint: '$dConstraint',
};

const KIND_TO_MACRO: Record<RequirementRelationKind, string> = {
  contain: '$contain',
  derive: '$derive',
  refine: '$refine',
  satisfy: '$satisfy',
  verify: '$verify',
  trace: '$trace',
  copy: '$copy',
};

function escapeArg(s: string): string {
  // Escape backslashes first so we don't double-escape the ones we add.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function quoted(s: string): string {
  return `"${escapeArg(s)}"`;
}

function renderRequirement(r: Requirement): string {
  const macro = TYPE_TO_MACRO[r.type];
  const args: string[] = [quoted(r.id), quoted(r.name)];
  if (r.text !== null && r.text !== '') {
    args.push(quoted(r.text));
  }
  return `${macro}(${args.join(', ')})`;
}

export function renderPlantUml(model: RequirementModel): string {
  const activeReqs = model.requirements.filter(
    (r) => !r.hidden && !r.deleted
  );
  const activeIds = new Set(activeReqs.map((r) => r.id));

  // Group requirements by parent. Parents that don't match any active
  // requirement id are treated as free-form package names; parents that
  // DO match are rendered via an explicit $contain relation below.
  const byParent = new Map<string | null, Requirement[]>();
  for (const r of activeReqs) {
    const key = r.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  }

  const lines: string[] = [];
  lines.push('@startuml');
  lines.push(INJECTED_PREAMBLE);
  lines.push('');

  // Package blocks: free-form parent names (not matching any requirement id).
  // Deterministic order: sort keys lexicographically.
  const packageKeys = [...byParent.keys()]
    .filter((k): k is string => k !== null && !activeIds.has(k))
    .sort();
  for (const pkgName of packageKeys) {
    lines.push(`package ${quoted(pkgName)} <<Frame>> {`);
    for (const r of byParent.get(pkgName)!) {
      lines.push(`    ${renderRequirement(r)}`);
    }
    lines.push('}');
    lines.push('');
  }

  // Top-level requirements (parentId === null)
  const topLevel = byParent.get(null) ?? [];
  for (const r of topLevel) {
    lines.push(renderRequirement(r));
  }

  // Requirements whose parent is another requirement — emit declaration
  // at top level; the parent-child link is encoded as a $contain below.
  const reqParented = [...byParent.entries()]
    .filter(([k]) => k !== null && activeIds.has(k))
    .flatMap(([, rs]) => rs);
  for (const r of reqParented) {
    lines.push(renderRequirement(r));
  }

  if (topLevel.length > 0 || reqParented.length > 0) {
    lines.push('');
  }

  // Synthetic $contain for requirement-to-requirement parent links.
  for (const r of reqParented) {
    lines.push(`$contain(${quoted(r.parentId!)}, ${quoted(r.id)})`);
  }

  // All other relations, filtered to active endpoints. $contain relations
  // from the model are skipped because the parent-child structure is
  // already encoded via parentId + the synthetic $contain above.
  for (const rel of model.relations) {
    if (rel.kind === 'contain') continue;
    if (!activeIds.has(rel.sourceId)) continue;
    if (!activeIds.has(rel.targetId)) continue;
    const macro = KIND_TO_MACRO[rel.kind];
    lines.push(`${macro}(${quoted(rel.sourceId)}, ${quoted(rel.targetId)})`);
  }

  lines.push('@enduml');
  return lines.join('\n');
}
