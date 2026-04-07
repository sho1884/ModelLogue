import { describe, it, expect } from 'vitest';
import { parse } from '../../src/parsers/stateMachineParser';
import {
  generateStateEventMatrix,
  generateStateStateMatrix,
} from '../../src/engines/matrixGenerator';

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

describe('MatrixGenerator', () => {
  describe('generateStateEventMatrix', () => {
    // GT-010
    it('generates correct State×Event matrix', () => {
      const { model } = parse(MATRIX_SOURCE);
      expect(model).not.toBeNull();

      const matrix = generateStateEventMatrix(model!);

      expect(matrix.rowHeaders).toEqual(['S0', 'S1', 'S2', 'S3']);
      expect(matrix.columnHeaders.sort()).toEqual(
        ['E1', 'E2', 'E3', 'E4', 'E5'].sort()
      );

      // Helper to look up cell value
      const cell = (state: string, event: string): string | null => {
        const row = matrix.rowHeaders.indexOf(state);
        const col = matrix.columnHeaders.indexOf(event);
        if (row === -1 || col === -1) return undefined as never;
        return matrix.cells[row][col];
      };

      // S0 row
      expect(cell('S0', 'E1')).toBe('S1');
      expect(cell('S0', 'E2')).toBeNull();
      expect(cell('S0', 'E3')).toBeNull();
      expect(cell('S0', 'E4')).toBeNull();
      expect(cell('S0', 'E5')).toBe('S0');

      // S1 row
      expect(cell('S1', 'E1')).toBeNull();
      expect(cell('S1', 'E2')).toBe('S2');

      // S2 row
      expect(cell('S2', 'E3')).toBe('S0');
      expect(cell('S2', 'E4')).toBe('S3');

      // S3 row
      expect(cell('S3', 'E1')).toBe('S1');
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

      const idleRow = matrix.rowHeaders.indexOf('Idle');
      const submitCol = matrix.columnHeaders.indexOf('submit');
      const cell = matrix.cells[idleRow][submitCol];

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

      expect(matrix.rowHeaders).toEqual(['A', 'B']);
      expect(matrix.rowHeaders).not.toContain('[*]');
    });
  });

  describe('generateStateStateMatrix', () => {
    // GT-011
    it('generates correct PreState×PostState matrix', () => {
      const { model } = parse(MATRIX_SOURCE);
      expect(model).not.toBeNull();

      const matrix = generateStateStateMatrix(model!);

      expect(matrix.rowHeaders).toEqual(['S0', 'S1', 'S2', 'S3']);
      expect(matrix.columnHeaders).toEqual(['S0', 'S1', 'S2', 'S3']);

      const cell = (from: string, to: string): string | null => {
        const row = matrix.rowHeaders.indexOf(from);
        const col = matrix.columnHeaders.indexOf(to);
        return matrix.cells[row][col];
      };

      // S0 row
      expect(cell('S0', 'S0')).toBe('E5');
      expect(cell('S0', 'S1')).toBe('E1');
      expect(cell('S0', 'S2')).toBeNull();
      expect(cell('S0', 'S3')).toBeNull();

      // S1 row
      expect(cell('S1', 'S2')).toBe('E2');

      // S2 row
      expect(cell('S2', 'S0')).toBe('E3');
      expect(cell('S2', 'S3')).toBe('E4');

      // S3 row
      expect(cell('S3', 'S1')).toBe('E1');
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

      const row = matrix.rowHeaders.indexOf('A');
      const col = matrix.columnHeaders.indexOf('B');
      expect(matrix.cells[row][col]).toBe('go, run');
    });
  });
});
