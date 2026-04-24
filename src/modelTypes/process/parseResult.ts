// Parse result types for the process-diagram parser (SR-124).

import type { ProcessModel } from './model';

export interface ParseError {
  line: number;
  message: string;
}

export interface ProcessParseResult {
  model: ProcessModel | null;
  errors: ParseError[];
}
