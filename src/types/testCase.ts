// API response types for the N-switch coverage generator.
// Mirrors the JSON shape documented in
// tools/nswitch/Requirements_Specification.md §9.2.3.

export interface TestCase {
  test_id: string;
  kind: 'positive' | 'negative';
  layer: string;
  length: number;
  start: string;
  sequence: string;
  end: string;
  // Negative (invalid-transition) tests only; empty string for positive.
  inject: string;
  expect: string;
  covers: string;
}

export interface CoverageRow {
  kind: 'transition' | 'chain' | 'invalid-transition';
  layer: string;
  element: string;
  hits: Record<string, string>;
  status: string;
  reason: string;
}

export interface UncoveredChainTransition {
  source: string;
  target: string;
  event: string | null;
  guard: string | null;
  action: string | null;
}

export interface UncoveredChain {
  layer: string;
  chain: UncoveredChainTransition[];
  reason: string;
}

export interface NswitchGenerationResult {
  tests: TestCase[];
  coverage: CoverageRow[];
  uncovered: UncoveredChain[];
  layers: string[];
}

export type NSwitchLevel = 0 | 1 | 2;

// The Test-cases tab coverage selector: positive N-switch levels plus the
// negative "Invalid" mode (invalid-transition tests, §7.2).
export type CoverageMode = NSwitchLevel | 'invalid';

export interface NswitchGenerateOptions {
  n?: NSwitchLevel;
  invalid?: boolean;
  format?: 'puml' | 'csv';
  layered?: boolean;
  max_cycle_unroll?: number;
  require_final?: boolean;
  signal?: AbortSignal;
}

export interface NswitchApiErrorBody {
  error: {
    type: string;
    message: string;
  };
}
