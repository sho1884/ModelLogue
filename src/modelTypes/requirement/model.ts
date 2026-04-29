// Requirement diagram canonical model (UR-014, ADR-012, ADR-013, ADR-014).
//
// Parallels StateMachineModel for the requirement-diagram type. Parsed
// from the macro DSL form and/or the semi-structured seed form defined
// in src/grammars/requirementDiagram.ebnf v1.2.

export type RequirementType =
  | 'requirement'
  | 'functionalRequirement'
  | 'nonFunctionalRequirement'
  | 'designConstraint';

/**
 * Abstraction tier (ADR-015 / SR-118). Orthogonal to `type` and `group`.
 * Closed value space; extension requires a follow-up ADR.
 */
export type RequirementLevel = 'user' | 'system' | 'design';

export interface Requirement {
  /** Stable identifier, unique within the model. */
  id: string;
  /**
   * The requirement statement — the short form of what is required
   * (or, for designConstraint type, the constraint itself). Maps to
   * the second macro argument (`$name` in preamble procedure
   * parameters; the DSL parameter name is kept as SysML convention).
   * For long-form prose, use `text`.
   */
  statement: string;
  /** Optional long-form text (the third argument). May contain \n. */
  text: string | null;
  /** Which macro / seed-type produced this entry. */
  type: RequirementType;
  /**
   * Id of the containing package or composite requirement; null for
   * top-level. Populated by `package "…" { ... }` grouping or
   * `$contain(parent, child)` relations.
   */
  parentId: string | null;
  /**
   * Review state: temporarily not of interest (ADR-014). Diagram
   * renderer (SR-114) skips this requirement and any touching relation,
   * but the row remains in the list.
   */
  hidden: boolean;
  /**
   * Review state: decided out, kept as evidence (ADR-014). Shown
   * strikethrough in the list tab, excluded from diagram and from
   * orphan analysis. `deleted=true` requires `note` non-empty.
   */
  deleted: boolean;
  /**
   * Free-form review annotation. When `deleted=true`, this carries the
   * mandatory deletion reason. Otherwise optional — used for working
   * notes like "needs clarification". Empty string means no note.
   */
  note: string;
  /**
   * Abstraction tier (ADR-015 / SR-118). Orthogonal to `type` and
   * `group`. Used as a visual grouping axis when chosen by SR-119, and
   * as a filter for level-aware analytics (e.g. "every system-level
   * requirement should derive from ≥1 user-level requirement").
   * Null = unspecified.
   */
  level: RequirementLevel | null;
  /**
   * Free-text classification axis (ADR-015 / SR-118). Used to slice
   * requirements by review-purpose-specific groupings (component area,
   * phase, sub-system, etc.). Orthogonal to `type` and `level`. The
   * "one axis per diagram" discipline (ADR-015) means: when both
   * `level` and `group` are populated in the same model, only one
   * should drive the visual grouping in any single review diagram.
   * Null = unspecified.
   */
  group: string | null;
}

export type RequirementRelationKind =
  | 'contain'
  | 'derive'
  | 'refine'
  | 'satisfy'
  | 'verify'
  | 'trace'
  | 'copy';

export interface RequirementRelation {
  /** The first argument of the relation macro. */
  sourceId: string;
  /** The second argument of the relation macro. */
  targetId: string;
  /** Which macro produced this relation. Determines source/target semantics. */
  kind: RequirementRelationKind;
}

export interface RequirementModel {
  requirements: Requirement[];
  relations: RequirementRelation[];
}
