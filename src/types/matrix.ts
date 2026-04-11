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
