// Parse result types for the requirement-diagram parser (SR-110).

import type { RequirementModel } from './model';

export interface ParseError {
  line: number;
  message: string;
}

export interface RequirementParseResult {
  model: RequirementModel | null;
  errors: ParseError[];
}
