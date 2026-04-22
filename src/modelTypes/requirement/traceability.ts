// SR-111: Traceability matrix data for the requirement-diagram type.
//
// Rows and columns are active (non-hidden, non-deleted) requirement ids.
// Each cell holds the list of relation kinds from the row's requirement
// to the column's requirement, if any.
//
// refine / copy are included per ADR-013 (r-to-r kinds are the primary
// scope). $contain relations implied by parentId are surfaced too, so
// the matrix answers "how are these requirements connected?" without
// needing the reviewer to glance at packages separately.

import type { RequirementModel, RequirementRelationKind } from './model';

export type RelationKindAbbrev = 'D' | 'R' | 'C' | 'Cp';

const KIND_TO_ABBREV: Partial<Record<RequirementRelationKind, RelationKindAbbrev>> =
  {
    derive: 'D',
    refine: 'R',
    contain: 'C',
    copy: 'Cp',
  };

export interface TraceabilityMatrix {
  /** Active requirement ids in declaration order; also the row AND column order. */
  ids: string[];
  /**
   * cells[rowId][colId] = list of kind abbreviations, most-specific first.
   * Empty array ⇒ no relation from row to col.
   */
  cells: Record<string, Record<string, RelationKindAbbrev[]>>;
}

export function buildTraceabilityMatrix(
  model: RequirementModel
): TraceabilityMatrix {
  const active = model.requirements.filter((r) => !r.hidden && !r.deleted);
  const activeIds = active.map((r) => r.id);
  const activeIdSet = new Set(activeIds);

  const cells: Record<string, Record<string, RelationKindAbbrev[]>> = {};
  for (const rowId of activeIds) {
    cells[rowId] = {};
    for (const colId of activeIds) cells[rowId][colId] = [];
  }

  // Relations from the model (derive / refine / copy / satisfy / etc.).
  for (const rel of model.relations) {
    const abbrev = KIND_TO_ABBREV[rel.kind];
    if (!abbrev) continue; // satisfy / verify / trace are out of scope (ADR-013)
    if (!activeIdSet.has(rel.sourceId)) continue;
    if (!activeIdSet.has(rel.targetId)) continue;
    cells[rel.sourceId][rel.targetId].push(abbrev);
  }

  // parentId-driven containment (package membership OR $contain), where
  // the parent is itself a requirement.
  for (const r of active) {
    if (!r.parentId) continue;
    if (!activeIdSet.has(r.parentId)) continue;
    const list = cells[r.parentId][r.id];
    if (!list.includes('C')) list.push('C');
  }

  return { ids: activeIds, cells };
}
