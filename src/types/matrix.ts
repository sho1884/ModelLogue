// Matrix data types for state transition tables (hybrid pattern per ADR-009)

/**
 * A row (and also a column, for the PreState×PostState matrix) of a
 * state transition matrix. When composite states are present the matrix
 * is shown in the hybrid pattern: composite-state rows appear at level 0
 * and their child states at level 1, indented under their parent.
 */
export interface MatrixRow {
  /** The state id this row represents. */
  stateId: string;
  /** Display label. */
  label: string;
  /** 0 = top-level, 1 = child of a composite. Used for indentation. */
  level: number;
  /** True when this row represents a composite state. */
  isComposite: boolean;
}

export interface MatrixData {
  /**
   * Row entries in display order. Composite states come before their
   * children; siblings after composites follow the usual order.
   */
  rows: MatrixRow[];
  /**
   * Column headers. For State×Event matrix these are event names;
   * for PreState×PostState matrix these are target state rows that
   * mirror the row list (so columns carry the same level/composite info).
   */
  columnHeaders: string[];
  /** [rowIndex][colIndex] cell values, or null when empty. */
  cells: (string | null)[][];
}

/**
 * SR-020: what a cell with no transition renders as, wherever the matrix is
 * shown to a *human* — on screen and in the HTML clipboard payload that
 * spreadsheets/Word import. A blank cell reads as "someone forgot to fill
 * this in"; `-` says "there is deliberately no transition here", which is
 * the negative-test target (UR-013, nswitch §7.2).
 *
 * ASCII on purpose (locale-safe; survives a paste into any tool).
 *
 * This does NOT apply to the canonical CSV. There an empty cell *is* the
 * encoding for "no transition" (nswitch §4.2.2), and the CLI derives its
 * INV tests from it — writing `-` there makes it parse as a target state
 * named "-" and the CLI rejects the file. Machine format, different layer:
 * see `transitionTableSerializer.modelToCanonicalCsv`.
 */
export const EMPTY_CELL_DISPLAY = '-';

/** True when a matrix cell carries no transition. */
export function isEmptyCell(cell: string | null): boolean {
  return cell == null || cell === '';
}
