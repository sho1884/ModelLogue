// API response types for the nswitch generator.
// Mirrors the JSON shape in tools/nswitch/Requirements_Specification.md
// §1.1 (Tests / Scenarios, ids) and §6 (columnar output).

export interface Step {
  event: string;
  reached: string;
}

// A Test = one verification pattern (§1.1). Positive N-switch chain (0S/1S/2S)
// or a negative invalid transition (INV).
export interface Test {
  id: string; // <scope>-<type>-<NNN>
  type: '0S' | '1S' | '2S' | 'INV';
  scope: string;
  start: string;
  steps: Step[]; // positive: the chain's (event, reached) steps; INV: []
  // INV only — the pure (state, forbidden event) -> no-transition condition.
  event: string; // the forbidden event injected at `start`
  expect: string; // "no-transition"
  // positive only:
  scenarios: string[]; // Scenario ids that exercise this Test
}

// A Scenario = one executable walk covering several positive Tests (§1.1).
export interface Scenario {
  id: string; // <scope>-SC-<NNN>
  scope: string;
  start: string;
  steps: Step[];
  covers: string[]; // Test ids exercised
}

export interface UncoveredChainTransition {
  source: string;
  target: string;
  event: string | null;
  guard: string | null;
  action: string | null;
}

export interface UncoveredChain {
  scope: string;
  chain: UncoveredChainTransition[];
  reason: string;
}

export interface NswitchGenerationResult {
  tests: Test[];
  scenarios: Scenario[];
  uncovered: UncoveredChain[];
  scopes: string[];
}

export type NSwitchLevel = 0 | 1 | 2;

// The Test-cases tab coverage selector: positive N-switch levels plus the
// negative "Invalid" mode (invalid-transition Tests, §7.2).
export type CoverageMode = NSwitchLevel | 'invalid';

export interface NswitchGenerateOptions {
  n?: NSwitchLevel;
  invalid?: boolean;
  name?: string; // scope name for the outermost machine (§1.1)
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
