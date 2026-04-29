import { describe, it, expect } from 'vitest';
import { parse } from '../../src/modelTypes/state-machine/parser';
import {
  generateStateEventMatrix,
  generateStateStateMatrix,
} from '../../src/modelTypes/state-machine/matrixGenerator';
import type { MatrixData } from '../../src/types/matrix';

// GT-010 / GT-011: Matrix generation from test_strategy.yaml
const MATRIX_SOURCE = `
@startuml
[*] --> S0
S0 --> S1 : E1
S1 --> S2 : E2
S2 --> S0 : E3
S2 --> S3 : E4
S0 --> S0 : E5
S3 --> S1 : E1
@enduml`;

function findCell(
  matrix: MatrixData,
  rowLabel: string,
  colLabel: string
): string | null {
  const rowIndex = matrix.rows.findIndex((r) => r.label === rowLabel);
  const colIndex = matrix.columnHeaders.indexOf(colLabel);
  if (rowIndex === -1 || colIndex === -1) return null;
  return matrix.cells[rowIndex][colIndex];
}

describe('MatrixGenerator', () => {
  describe('generateStateEventMatrix', () => {
    // GT-010
    it('generates correct State×Event matrix', () => {
      const { model } = parse(MATRIX_SOURCE);
      expect(model).not.toBeNull();

      const matrix = generateStateEventMatrix(model!);

      expect(matrix.rows.map((r) => r.label)).toEqual([
        'S0',
        'S1',
        'S2',
        'S3',
      ]);
      expect(matrix.rows.every((r) => r.level === 0)).toBe(true);
      expect(matrix.rows.every((r) => !r.isComposite)).toBe(true);
      expect(matrix.columnHeaders.sort()).toEqual(
        ['E1', 'E2', 'E3', 'E4', 'E5'].sort()
      );

      // S0 row
      expect(findCell(matrix, 'S0', 'E1')).toBe('S1');
      expect(findCell(matrix, 'S0', 'E2')).toBeNull();
      expect(findCell(matrix, 'S0', 'E3')).toBeNull();
      expect(findCell(matrix, 'S0', 'E4')).toBeNull();
      expect(findCell(matrix, 'S0', 'E5')).toBe('S0');

      // S1 row
      expect(findCell(matrix, 'S1', 'E1')).toBeNull();
      expect(findCell(matrix, 'S1', 'E2')).toBe('S2');

      // S2 row
      expect(findCell(matrix, 'S2', 'E3')).toBe('S0');
      expect(findCell(matrix, 'S2', 'E4')).toBe('S3');

      // S3 row
      expect(findCell(matrix, 'S3', 'E1')).toBe('S1');
    });

    it('shows guard annotations in cells', () => {
      const source = `
@startuml
[*] --> Idle
Idle --> Processing : submit [valid] / validate()
Idle --> Error : submit [invalid] / showError()
@enduml`;

      const { model } = parse(source);
      const matrix = generateStateEventMatrix(model!);
      const cell = findCell(matrix, 'Idle', 'submit');

      // Multiple transitions with different guards
      expect(cell).toContain('Processing [valid]');
      expect(cell).toContain('Error [invalid]');
    });

    it('excludes pseudo-states from rows', () => {
      const source = `
@startuml
[*] --> A
A --> B : go
B --> [*]
@enduml`;

      const { model } = parse(source);
      const matrix = generateStateEventMatrix(model!);

      expect(matrix.rows.map((r) => r.label)).toEqual(['A', 'B']);
    });

    // GT-022: Hybrid State×Event matrix for a composite
    it('generates hybrid matrix with composite + child rows', () => {
      const source = `
@startuml
state Operating {
  [*] --> Idle
  Idle --> Working : start
  Working --> Idle : stop
}
[*] --> Operating
Operating --> Failure : fault
Failure --> Operating : reset
@enduml`;

      const { model } = parse(source);
      const matrix = generateStateEventMatrix(model!);

      // Rows: composite "Operating" first, then child states Idle/Working
      // (at level 1, indented), then sibling "Failure" at level 0.
      expect(matrix.rows.map((r) => r.label)).toEqual([
        'Operating',
        'Idle',
        'Working',
        'Failure',
      ]);
      expect(matrix.rows[0].isComposite).toBe(true);
      expect(matrix.rows[0].level).toBe(0);
      expect(matrix.rows[1].level).toBe(1); // Idle
      expect(matrix.rows[2].level).toBe(1); // Working
      expect(matrix.rows[3].level).toBe(0); // Failure

      // Group escape transition sits on the composite row, not on the children
      expect(findCell(matrix, 'Operating', 'fault')).toBe('Failure');
      expect(findCell(matrix, 'Idle', 'fault')).toBeNull();
      expect(findCell(matrix, 'Working', 'fault')).toBeNull();

      // Internal transitions sit on the child rows
      expect(findCell(matrix, 'Idle', 'start')).toBe('Working');
      expect(findCell(matrix, 'Working', 'stop')).toBe('Idle');

      // Failure sibling gets its own transition
      expect(findCell(matrix, 'Failure', 'reset')).toBe('Operating');
    });
  });

  describe('generateStateStateMatrix', () => {
    // GT-011
    it('generates correct PreState×PostState matrix', () => {
      const { model } = parse(MATRIX_SOURCE);
      expect(model).not.toBeNull();

      const matrix = generateStateStateMatrix(model!);

      expect(matrix.rows.map((r) => r.label)).toEqual([
        'S0',
        'S1',
        'S2',
        'S3',
      ]);
      expect(matrix.columnHeaders).toEqual(['S0', 'S1', 'S2', 'S3']);

      // S0 row
      expect(findCell(matrix, 'S0', 'S0')).toBe('E5');
      expect(findCell(matrix, 'S0', 'S1')).toBe('E1');
      expect(findCell(matrix, 'S0', 'S2')).toBeNull();
      expect(findCell(matrix, 'S0', 'S3')).toBeNull();

      // S1 row
      expect(findCell(matrix, 'S1', 'S2')).toBe('E2');

      // S2 row
      expect(findCell(matrix, 'S2', 'S0')).toBe('E3');
      expect(findCell(matrix, 'S2', 'S3')).toBe('E4');

      // S3 row
      expect(findCell(matrix, 'S3', 'S1')).toBe('E1');
    });

    it('shows multiple events between same state pair', () => {
      const source = `
@startuml
[*] --> A
A --> B : go
A --> B : run
@enduml`;

      const { model } = parse(source);
      const matrix = generateStateStateMatrix(model!);

      expect(findCell(matrix, 'A', 'B')).toBe('go, run');
    });

    it('includes composite state in both row and column axes', () => {
      const source = `
@startuml
state Operating {
  [*] --> Idle
  Idle --> Working : start
}
[*] --> Operating
Operating --> Failure : fault
@enduml`;

      const { model } = parse(source);
      const matrix = generateStateStateMatrix(model!);

      // Rows and columns both contain: Operating, Idle, Working, Failure
      expect(matrix.rows.map((r) => r.label)).toEqual([
        'Operating',
        'Idle',
        'Working',
        'Failure',
      ]);
      expect(matrix.columnHeaders).toEqual([
        'Operating',
        'Idle',
        'Working',
        'Failure',
      ]);

      // Composite row holds the group-escape event
      expect(findCell(matrix, 'Operating', 'Failure')).toBe('fault');
      // Child transitions sit on child rows
      expect(findCell(matrix, 'Idle', 'Working')).toBe('start');
    });
  });
});
