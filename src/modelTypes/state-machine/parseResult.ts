// Parser result types

import type { StateMachineModel } from './model';

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  model: StateMachineModel | null;
  errors: ParseError[];
}
