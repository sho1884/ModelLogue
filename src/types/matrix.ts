// Matrix data types for state transition tables

export interface MatrixData {
  rowHeaders: string[];
  columnHeaders: string[];
  cells: (string | null)[][];
}
