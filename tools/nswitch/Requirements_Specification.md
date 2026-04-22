# modellogue-nswitch / N-switch coverage test generator

| Item / 項目 | Content / 内容 |
|------|---------|
| Document / 文書 | Requirements Specification — N-switch coverage test case generator |
| Version | 0.4 (draft) |
| Created | 2026-04-21 |
| Status / 状態 | Draft — pre-implementation |
| Language / 実装言語 | **Python** (3.10+) |
| Related ADR | ADR-009 (one-level composite states), ADR-010 (auxiliary services in the same repo), ADR-011 (strict formats and deterministic conversion) |
| Canonical CSV | §4.2 defines the **project-wide canonical state-transition-table CSV**. ModelLogue's SR-101 export is required to emit this same format so artifacts round-trip between the GUI, this CLI, and version control. |

---

## 1. Overview / 概要

**modellogue-nswitch** is a self-contained command-line tool that reads a state machine description — either a **PlantUML source** (in the EBNF-defined subset) or a **state transition table CSV** — and emits a **test case CSV** covering every N-switch transition sequence. It is an ADR-010 auxiliary service: independent of the ModelLogue GUI, runnable anywhere Python 3.10+ is available, designed for CI/CD pipelines and data-driven testing frameworks.

ModelLogue とは独立に動くテストケース生成 CLI。入力は **PlantUML サブセット** または **状態遷移表 CSV** のどちらでも可。出力は N-switch カバレッジを満たすテストケース CSV。ADR-010 の補助サービス方針に従い Python で独立実装し、CI から容易に呼び出せる。

### Typical workflow / 想定ワークフロー

1. A state machine is modeled — either via the ModelLogue GUI (reviewed with AI assistance), or directly authored in PlantUML, or edited as a CSV transition table in a spreadsheet.
2. The final source is committed to version control.
3. CI invokes `modellogue-nswitch`, producing test case CSV as artifact.
4. A data-driven testing framework consumes the CSV to drive actual test execution.

### Non-goals / スコープ外

- **Test oracle generation**: this tool emits *sequences* to exercise, not expected outputs/assertions. Pairing with oracles is the downstream framework's job.
- **Layout / image output**: text and CSV only. Visual rendering stays in the GUI.
- **Beyond the ADR-009 subset**: orthogonal regions, nested composites beyond one level, history pseudo-states, and dot-notation entry are rejected at input.
- **Arbitrary N**: only N ∈ {0, 1, 2} is supported (see §3). Higher N yields combinatorial blow-up with little practical benefit for review-scale models.

---

## 2. Installation / インストール

### Prerequisites / 前提条件

- Python 3.10 or later
- `pipx` recommended for CLI isolation (optional)

### From the repository / リポジトリから

```bash
cd tools/nswitch
pip install -e .        # editable install into current environment
# or, isolated install
pipx install .
```

### From PyPI (future)

```bash
pipx install modellogue-nswitch    # not yet published
```

After installation the CLI is available as:

```bash
modellogue-nswitch [options] [input-file]
```

or via module invocation:

```bash
python -m modellogue_nswitch [options] [input-file]
```

---

## 3. Usage / 使い方

### Basic syntax / 基本構文

```
modellogue-nswitch [options] [input-file]
```

- If `input-file` is given, reads from that file. If omitted, reads from stdin.
- Output is written to stdout by default. `-o FILE` writes to a file.
- Diagnostics (errors, warnings) go to **stderr**, keeping stdout clean for piping.
- Input format is auto-detected by extension (`.puml` / `.plantuml` → PlantUML, `.csv` → CSV transition table) or by the first non-blank line (starts with `@startuml` → PlantUML; otherwise CSV). Use `--format` to force.

### Options / オプション

| Option | Default | Description |
|---|---|---|
| `-n N`, `--n N` | `1` | N-switch level. Accepted values: **0 / 1 / 2** only. N=0 exercises each transition once; N=1 each transition pair; N=2 each triple. |
| `--format puml\|csv` | auto | Force input format. |
| `-o FILE`, `--output FILE` | stdout | Write output to FILE instead of stdout. |
| `--coverage` | off | Emit coverage-report CSV (which tests cover which transitions / chains) instead of the default test-case CSV. |
| `--layered` / `--no-layered` | `--layered` | Apply the per-composite layered strategy. With `--no-layered`, composites are treated as opaque leaf states (no child-layer tests). |
| `--max-cycle-unroll K` | `3` | Per-test cap on how many times any single transition may be traversed during **path construction** (§7.4). Prevents combinatorial blow-up on cyclic state machines. Does NOT apply to matrix-power enumeration (§7.2), which is already bounded by N ≤ 2. |
| `--require-final` | off | Error out (exit 2) if the model has no initial→final reachable path. Default behavior accepts cyclic / mainloop-style models and generates tests that close on a revisited state — see §7.4. |
| `-h`, `--help` | — | Show help and exit. |
| `--version` | — | Show version and exit. |

### Exit codes / 終了コード

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | Input error (parse failure, unsupported construct, file not found, invalid `-n` value, malformed CSV). |
| `2` | Unsatisfiable coverage. Emitted only when `--require-final` is set AND the model has no initial→final path, OR when neither final-reaching nor cyclic-closure paths exist. Cyclic / mainloop-style models (no final state) are accepted by default — see §7.4. |
| `3` | Cycle-unroll limit exceeded before all required chains could be covered. Increase `--max-cycle-unroll` or reduce `-n`. |

---

## 4. Input formats / 入力フォーマット

### 4.1 PlantUML source (EBNF subset)

The tool accepts exactly the PlantUML subset defined by the grammar file `src/grammars/stateDiagram.ebnf` in the ModelLogue repository. Constructs **outside** that grammar — orthogonal regions, nested composites, history pseudo-states, dot-notation entry, entry/exit points — are rejected with a parse error.

Non-semantic PlantUML directives are **tolerated and skipped**: `hide`, `show`, `skinparam`, `!theme`, `!pragma`, `scale`, `title`, `caption`, `header`, `footer`, `left to right direction`, `top to bottom direction`, `note … / end note`, `legend … / end legend`, `mainframe`. This matches ModelLogue's own parser (SR-002).

#### 4.1.1 Parser implementation & EBNF handling

The Python parser is **hand-implemented** to conform to `stateDiagram.ebnf`; it does not load the `.ebnf` file at runtime. The EBNF is a **design-time reference** — the single source of truth for what the language accepts, paired with a conformance test suite that keeps the implementation aligned (see §12).

Consequences for packaging (`pyproject.toml` / `pipx install`):

- The installable Python package has **no runtime dependency** on files outside its own directory. `modellogue-nswitch` installs and runs identically whether built from the ModelLogue monorepo or from a standalone tarball.
- The EBNF file is **not shipped** with the wheel by default. It is referenced in documentation and used by the conformance tests (which sit in the package's `tests/` directory and embed the expected subset as executable test cases).
- If, in the future, a runtime diagnostic needs the EBNF text (e.g., `--show-grammar`), the file will be copied into `modellogue_nswitch/_data/stateDiagram.ebnf` as package data and loaded via `importlib.resources`. That copy is generated by a build hook that fails CI if the source file has changed without the hook being re-run, so the two cannot drift.
- ModelLogue's TypeScript parser and `modellogue-nswitch`'s Python parser are **two independent implementations** of the same EBNF. Equivalence is enforced by a shared golden-input suite (a set of `.puml` files + expected parse results) that both sides are required to pass.

### 4.2 Canonical state-transition-table CSV

This section defines the **project-wide canonical** state-transition-table CSV. It is both this tool's input format (§4) AND ModelLogue's `Save as .csv` output format (SR-101). A file emitted by one side is directly consumable by the other.

RFC 4180 quoting. UTF-8. LF or CRLF line endings (writers SHOULD use LF for new files). First row is the header.

#### 4.2.1 Required columns

The first five columns are fixed and MUST appear in this exact order.

| # | Column | Required | Meaning |
|---|---|---|---|
| 1 | `state` | yes | State id. Non-empty; forms a unique key within the file. |
| 2 | `label` | yes (may be empty) | Display label. If empty, readers treat it as equal to `state`. |
| 3 | `parent` | yes (may be empty) | Id of the enclosing composite state, or empty for top-level states. Must refer to a `state` whose `type` is `composite`. |
| 4 | `type` | yes | One of `normal` or `composite`. The initial and final pseudo-states are **not** represented as rows; see §4.2.3. |
| 5 | `initial` | yes | Marks this state as the target of its layer's initial pseudo-state. Empty means "not the initial target". Non-empty values follow the syntax in §4.2.3 and may carry a guard and/or action, matching PlantUML's `[*] --> S : [guard] / action`. At most one non-empty `initial` cell per distinct `parent` scope (one for top-level, one per composite). |

#### 4.2.2 Event columns

Columns 6 and onward are event columns, one per event. Column header = event name. Each cell encodes the transitions fired on that (state, event) pair:

- **Empty cell**: no transition.
- **`target`**: transition to the state whose id is `target`.
- **`target [guard]`**: transition with a guard.
- **`target / action`**: transition with an action.
- **`target [guard] / action`**: both a guard and an action.
- **`[*]`** as the target: transition to the enclosing layer's final pseudo-state. At top level it means the top-level final; in a composite's child row it means that composite's internal final.
- **`t1 [g1] / a1; t2 [g2] / a2`** (semicolon-separated): multiple transitions fired on the same event (typical when guards are mutually exclusive).

Spaces around the `;`, `[`, `]`, `/` separators are tolerated but not required.

#### 4.2.3 Pseudo-state convention — no rows for `[*]`

Initial and final pseudo-states are **implicit** in the canonical form:

- The initial pseudo-state per layer is the state row whose `initial` cell is non-empty (one per `parent` scope).
- The final pseudo-state per layer appears only as a cell value `[*]`; there is no row for it.

Rationale: keeping `[*]` off the row axis makes the CSV smaller, lets reviewers scan states without pseudo noise, and matches how the ModelLogue internal model treats them (pseudo-states are synthesized on demand).

**Initial-transition cell syntax** — the `initial` column cell carries whatever guard/action the PlantUML source attaches to the `[*] --> S` edge, using the same lexical form as event cells (§4.2.2):

| Cell value | Equivalent PlantUML | Meaning |
|---|---|---|
| (empty) | (no initial edge to this state) | Not the layer's initial target. |
| `Y` | `[*] --> S` | Plain initial transition, no guard or action. |
| `Y [guard]` | `[*] --> S : [guard]` | Guarded initial transition. |
| `Y / action` | `[*] --> S : / action` | Initial transition with an entry action (e.g. `init_vars()`). |
| `Y [guard] / action` | `[*] --> S : [guard] / action` | Both. |

The `Y` token is a constant marker — it is **not** a target state id (the target is the row itself). Readers MUST reject any other marker (`X`, `1`, `true`, …) so writers and spreadsheets converge on a single spelling.

#### 4.2.4 Composite-state rules

- A row with `type=composite` represents a composite state. Its own transitions (cells) are **group-escape transitions** — their source is the composite itself and the target is outside the composite (or `[*]` for layer-final).
- Entry transitions into a composite are expressed as cells pointing at the composite's id; the internal entry target is the child row of that composite marked `initial=Y`.
- Internal transitions are cells on child rows with targets among siblings (or `[*]`).
- ModelLogue's subset permits one level of composites (ADR-009); nested composites are invalid in this CSV and MUST be rejected by readers with a clear error.

#### 4.2.5 Column-order robustness

Readers SHOULD match the first five columns by **name**, not position, so a spreadsheet reordered by a human can still be parsed. Writers MUST emit them in the §4.2.1 order.

#### 4.2.6 Example — flat

```csv
state,label,parent,type,initial,start,stop,fault,reset
Idle,待機,,normal,Y,Active,,,
Active,動作,,normal,,,Idle,Failure,[*]
Failure,故障,,normal,,,,,Idle
```

Reading:
- `Idle` is top-level initial; has display label `待機`.
- `Active --stop--> Idle`, `Active --fault--> Failure`, `Active --reset--> (top-level final)`.
- `Failure --reset--> Idle`.

#### 4.2.7 Example — with one composite

```csv
state,label,parent,type,initial,start,stop,pause,resume
Idle,,,normal,Y,Operating,,,
Operating,,,composite,,,Idle,,
Running,,Operating,normal,Y,,,Paused,
Paused,,Operating,normal,,,,,Running
```

Reading:
- Top level: `Idle --start--> Operating`. `Operating --stop--> Idle` is a group-escape.
- Inside `Operating`: `Running` is the composite's internal initial; `Running --pause--> Paused`; `Paused --resume--> Running`.

---

## 5. Examples / 使用例

### 5.1 Default (1-switch) from a PlantUML file

```bash
modellogue-nswitch input.puml
```

### 5.2 2-switch coverage to a file

```bash
modellogue-nswitch -n 2 -o out/tests.csv input.puml
```

### 5.3 From a CSV transition table

```bash
modellogue-nswitch transitions.csv
```

### 5.4 Coverage report

```bash
modellogue-nswitch --coverage input.puml
```

### 5.5 From stdin with explicit format

```bash
cat input.puml | modellogue-nswitch --format puml > tests.csv
```

### 5.6 CI pipeline snippet (GitHub Actions)

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'
- run: pipx install ./tools/nswitch
- run: modellogue-nswitch -n 1 -o artifacts/tests.csv models/order.puml
- uses: actions/upload-artifact@v4
  with: { path: artifacts/tests.csv }
```

---

## 6. Output format / 出力フォーマット

RFC 4180 CSV, UTF-8, LF line endings. Two output modes.

### 6.1 Test case CSV (default)

One row per test case. Each test is a sequence of transitions, grouped by *layer* (top layer for the composed machine, child layers for each composite's internal state machine).

| Column | Type | Meaning |
|---|---|---|
| `test_id` | string | Stable identifier. Format `<layer>-<seq>`, e.g. `top-001`, `Operating-001`. |
| `layer` | string | `top` for the composed machine; the composite's state id (e.g. `Operating`) for a child-layer test. |
| `length` | integer | Number of transitions in this test. |
| `start` | string | State id the sequence starts at. |
| `sequence` | string | Pipe-separated event labels, in order. Each element is `event` optionally followed by `[guard]` or `/action` (same textual form as the input). |
| `end` | string | State id the sequence ends at. |
| `covers` | string | Semicolon-separated list of transition identifiers (`<source>--<event>-->target`) exercised by this test. |

Example:

```csv
test_id,layer,length,start,sequence,end,covers
top-001,top,3,[*]_init,start|fault|reset,[*]_final,[*]_init--()-->Idle;Idle--start-->Active;Active--fault-->Failure;Failure--reset-->Idle
top-002,top,4,[*]_init,start|stop|start|reset,[*]_final,[*]_init--()-->Idle;Idle--start-->Active;Active--stop-->Idle;Idle--start-->Active;Active--reset-->[*]_final
Operating-001,Operating,2,[*]_init_Operating,pause|resume,[*]_final_Operating,[*]_init_Operating--()-->Running;Running--pause-->Paused;Paused--resume-->Running
```

### 6.2 Coverage report CSV (`--coverage`)

One row per transition (N=0) or per N-chain (N ≥ 1). Columns are the test-case ids, cells mark coverage.

| Column | Meaning |
|---|---|
| `kind` | `transition` for a single transition, `chain` for an N-chain. |
| `layer` | `top` or composite-id. |
| `element` | Transition id (`A--event-->B`) or chain (`A--ev1-->B--ev2-->C`). |
| `test_id…` | One column per test case; `#` when covered, empty otherwise. |

Example:

```csv
kind,layer,element,top-001,top-002,Operating-001
transition,top,Idle--start-->Active,#,#,
transition,top,Active--fault-->Failure,#,,
transition,top,Active--stop-->Idle,,#,
chain,top,Idle--start-->Active--fault-->Failure,#,,
chain,top,Idle--start-->Active--stop-->Idle,,#,
transition,Operating,Running--pause-->Paused,,,#
```

### 6.3 Canonicality / 決定論

For the same input and the same option values, the tool produces **byte-identical output** across runs, machines, and Python versions within 3.10+. Sort keys:

- Tests ordered by `(layer, seq_number)` where layers sort `top` first then composite ids alphabetically, seq numbers assigned in the order tests are constructed.
- Coverage rows ordered by `(kind, layer, element)`, each sorted lexicographically.
- Cell-level iteration (e.g., required chains) is sorted by canonical chain string.

This satisfies ADR-011: CI diffs on generated artifacts are meaningful.

---

## 7. Algorithm / アルゴリズム

### 7.1 Layered decomposition / レイヤ分解

ModelLogue's state-diagram subset permits **one level of composite states** (ADR-009). Layered testing treats each composite as an independent sub-model plus a "black box" in the parent.

Two layers per composite are built from a single parsed model:

**Top layer** — the composed machine with each composite replaced by a single black-box node.
- Transitions preserved at top: every transition whose source and target are both at the top level, AND every group-escape transition (source is a composite) and every entry transition (target is a composite).
- The layer's pseudo-states: `[*]_init` and `[*]_final`.

**Child layer (one per composite `X`)** — `X`'s internal state machine.
- States: the children of `X`.
- Transitions: only those with both endpoints inside `X`.
- Pseudo-states: `[*]_init_X` and `[*]_final_X`.

Tests generated per layer are emitted with `layer=top` or `layer=<X>`.

### 7.2 Path-algebra matrix / 経路代数行列

Per layer we build a square matrix `A` indexed by the layer's states.

- **Element type**: a set of transition sequences. Each sequence is an ordered tuple of transitions; a singleton tuple represents one direct transition.
- **Base `A`** (the matrix of length-1 sequences): `A[i][j] = { (t,) | t ∈ transitions, t.source = i, t.target = j }`. Pairs with no direct transition yield `∅`.
- **Semiring**: `(P(Seq), ∪, ⊗)` where `P(Seq)` is the powerset of sequences, `∪` is set union, and `⊗` is pairwise concatenation-and-union: `a ⊗ b = { s_a ++ s_b | s_a ∈ a, s_b ∈ b }`.
- **Matrix product**: `(A · B)[i][j] = ⋃_k (A[i][k] ⊗ B[k][j])`.
- **Powers**: `A^k[i][j]` is the set of every transition sequence of length exactly `k` that takes the machine from `i` to `j`.

The **required coverage set** at a layer for N-switch (N ∈ {0, 1, 2}) is:

```
Required[layer] = ⋃_{i,j} A^(N+1)[i][j]
```

Every element of `Required[layer]` is a chain that must appear in at least one generated test.

### 7.3 Cycle guard / サイクル抑制

**Scope of the cap** — `--max-cycle-unroll K` applies **only** to path construction (§7.4). Specifically, the prefix `p1` and suffix `p2` searches reject any path that traverses the same transition more than K times. The matrix-power enumeration (§7.2) is bounded by `N ≤ 2` and needs no runtime cap.

If a required chain in `Required[layer]` cannot be embedded in any finite path respecting the cap, it is reported as **uncovered** in the coverage report (`status=unreachable-within-cap`), and the process exits with code `3` after emitting the rest of the tests.

The default `K = 3` is generous enough for realistic review-scale models under `N ≤ 2`.

### 7.4 Test case construction / テストケース生成

Per layer, given `Required[layer]`:

1. Determine the layer's **termination policy**:
   - If `--require-final` is set AND the layer's final pseudo-state is unreachable from its initial pseudo-state, exit 2 immediately.
   - Otherwise compute the set of terminators:
     - `FINAL_TERMINATORS`: reached when the path arrives at a final pseudo-state.
     - `CYCLE_TERMINATORS`: reached when the path arrives at a state already visited earlier in the same path (loop closure).
     - Use `FINAL_TERMINATORS` when available; fall back to `CYCLE_TERMINATORS` for chains whose `p2` has no final-reaching suffix within the cycle-unroll cap.
2. Sort required chains by descending length (longer chains cover more subchains), then lexicographically by the chain string.
3. While chains remain uncovered:
   1. Pick the next uncovered chain `c`.
   2. Find a path `P = p1 · c · p2` where `p1` starts at the layer's initial pseudo-state and `p2` ends at a terminator (per the policy above). `p1` and `p2` are greedy shortest paths in the sequence-adjacency graph of `A¹`, subject to the cycle-unroll cap.
   3. If neither a final-reaching nor a cycle-closing `p2` exists within the cap, mark `c` uncovered (status=`unreachable-within-cap`) and continue.
   4. Mark `c` and every N-subchain of `P` as covered.
   5. Emit `P` as a test case. In the output CSV, the `end` column for a cycle-closed test is the revisited state's id, and `covers` includes only the transitions actually on the emitted path (the revisited state is not traversed a second time).
4. The algorithm is greedy. The result is a valid cover, not necessarily the minimum one (minimum cover is NP-hard, route-inspection-adjacent). Greedy + deterministic sort is reproducible, which is what ADR-011 requires.

**Non-terminating model example** (embedded mainloop, no final state):

```
@startuml
[*] --> Idle
Idle --> Ready : boot
Ready --> Running : start
Running --> Ready : tick
Running --> Error : fault
Error --> Ready : recover
@enduml
```

Here there is no transition to `[*]_final`. Default behavior: generate cyclic tests that close on revisited states (e.g., `[*]_init → Idle → Ready → Running → Ready`). Exit code `0`. With `--require-final` the tool would exit `2` instead.

### 7.5 Pseudo-state spelling conventions

- Top-layer initial: `[*]_init`. Final: `[*]_final`.
- Per-composite `X`: initial `[*]_init_X`, final `[*]_final_X`.
- The synthetic "transition" from an initial pseudo-state to its target (and from a terminal regular state to the matching final pseudo-state) is spelled with an event of `()` in the `covers` / `element` columns.

### 7.6 Input handling

- **PlantUML input**: parsed into an internal `StateMachineModel` equivalent to ModelLogue's TypeScript one (states with `id`, `label`, `type`, `parentId`; transitions with `source`, `target`, `event`, `guard`, `action`).
- **CSV input**: parsed into the same `StateMachineModel`. Pseudo-states are synthesized automatically: at each layer (top + one per composite) the `initial=Y` row becomes the target of a synthetic `[*]_init…` → target transition, and any cell pointing at `[*]` becomes a transition to the matching `[*]_final…`.

This internal representation is the single source of truth for downstream algorithm steps, regardless of input format.

---

## 8. Error handling / エラー処理

Diagnostics are written to **stderr** only. `stdout` stays clean even on errors, so pipes don't see contaminated output.

| Situation | stderr message shape | Exit |
|---|---|---|
| Invalid `-n` value (not 0, 1, 2) | `Error: -n must be 0, 1, or 2 (got <value>)` | 1 |
| Non-subset PlantUML construct | `Error: line <n>: <parser message>` | 1 |
| Malformed CSV (missing required column, bad cell value) | `Error: CSV: <details>` | 1 |
| File not found | `Error: <path>: no such file` | 1 |
| Ambiguous format | `Error: cannot auto-detect format; use --format` | 1 |
| No initial→final path exists | `Error: model has no path from any initial state to any final state` | 2 |
| Cycle-unroll cap hit with uncovered chains | `Warning: <N> chain(s) left uncovered due to --max-cycle-unroll cap` plus list of uncovered elements | 3 |

---

## 9. Programmatic API / ライブラリ API

In addition to the CLI, the tool exposes an importable Python API so it can be embedded in test frameworks without spawning a subprocess.

```python
from modellogue_nswitch import generate, parse_puml, parse_csv

# From PlantUML string
result = generate(parse_puml(source_string), n=1, layered=True)

# From CSV string
result = generate(parse_csv(csv_string), n=2)

# Result is a dataclass:
#   result.tests: list[TestCase]
#   result.coverage: list[CoverageRow]
#   result.uncovered: list[Chain]
#   result.layers: list[Layer]
```

Contract:

- **Pure function**: no file I/O in the core `generate`. Parsing has dedicated functions that accept strings.
- **No I/O in the core**: readers and writers live in separate modules so the library is usable in offline / sandboxed contexts.
- **Serializable results**: `dataclasses.asdict(result)` yields a JSON-serializable dict.
- **No ModelLogue dependency**: the library does not import anything from the ModelLogue frontend; it is self-contained in `tools/nswitch/`.

---

## 10. Future extensions / 将来拡張

- **Test-oracle annotations**: accept a companion file mapping events to assertion templates; inject into each test row.
- **State transition table CSV writer**: the inverse of §4.2, so that models from PlantUML can be exported as CSV too. (This overlaps with the planned standalone state-table converter service; the split will be decided at that point.)
- **Minimization**: replace greedy path cover with an exact route-inspection minimizer for small models.
- **Distinguishing sequences (W-method)**: add fault-detection tests beyond plain coverage.
- **Plugin hooks**: allow user-defined "test step" templates to shape the output CSV for specific frameworks (pytest parametrize, Cucumber Examples tables, etc.).

---

## 11. Related documents / 関連文書

- `Doc/requirements/system_requirements.yaml` — SR-102 (placeholder for "export generated test cases" from the GUI, when the day comes to integrate this tool into the ModelLogue UI).
- `Doc/architecture.md` §12.1 — auxiliary-service framing.
- `Doc/adr/ADR-009-composite-states-minimal-subset.yaml` — why only one level of composites.
- `Doc/adr/ADR-010-external-services-for-heavy-or-domain-specific-work.yaml` — why this tool lives outside the GUI.
- `Doc/adr/ADR-011-strict-formats-and-deterministic-conversion.yaml` — why output must be byte-deterministic and CSV must be strictly defined.
- `src/grammars/stateDiagram.ebnf` — the canonical grammar; this tool accepts exactly the same subset.

---

## 12. Testing and conformance / テストと整合性

The package ships with the following test suites, runnable via `pytest`:

- **Parser conformance** — for every production in `stateDiagram.ebnf`, at least one accept and one reject case. Kept inside `tests/conformance/` as small `.puml` snippets paired with expected parse results (or expected rejection messages).
- **Cross-parser equivalence** — a shared corpus of `.puml` files under `tests/shared_corpus/` that BOTH this Python parser and the ModelLogue TypeScript parser MUST accept and produce equivalent `StateMachineModel` output for. The Python side reads the corpus directly; the TypeScript side pulls the same corpus via a relative path in its own test runner. Divergences fail CI on either side.
- **Canonical CSV round-trip** — for a fixture set of PlantUML files, parse → emit canonical CSV → re-parse the CSV → assert structural equivalence of the two internal models.
- **Matrix-power coverage** — small hand-checked models where `Required[layer]` is enumerated by hand and compared against `A^(N+1)` output, for N ∈ {0, 1, 2}.
- **Byte-deterministic output** — run the generator twice on each fixture and assert output byte equality (ADR-011).

The EBNF file itself is not parsed at runtime; instead, "the parser accepts exactly what the EBNF says" is continuously verified by the conformance suite. When the EBNF is intentionally extended, the suite is extended first (red), then the parser (green) — doc-first / spec-first per `CLAUDE.md`.
