# modellogue-nswitch / N-switch coverage test generator

| Item / 項目 | Content / 内容 |
|------|---------|
| Document / 文書 | Requirements Specification — N-switch coverage test case generator |
| Version | 0.7 |
| Created | 2026-04-21 |
| Status / 状態 | Implemented in v0.1.0 at `tools/nswitch/src/modellogue_nswitch/` — batch CLI **and** HTTP API (`serve` subcommand, §9.2) both shipped. The HTTP mode is what ModelLogue's Test cases tab (SR-103) calls for reactive N-switch regeneration. |
| Language / 実装言語 | **Python** (3.10+) |
| Related ADR | ADR-009 (one-level composite states), ADR-010 (auxiliary services in the same repo), ADR-011 (strict formats and deterministic conversion) |
| Canonical CSV | §4.2 defines the **project-wide canonical state-transition-table CSV**. ModelLogue's SR-101 export is required to emit this same format so artifacts round-trip between the GUI, this CLI, and version control. |

---

## 1. Overview / 概要

**modellogue-nswitch** is a self-contained command-line tool that reads a state machine description — either a **PlantUML source** (in the EBNF-defined subset) or a **state transition table CSV** — and emits **Tests** and **Scenarios** (§1.1). *Tests* are the coverage patterns to verify — each valid N-switch chain and each invalid (forbidden) transition — and are the **primary** output. *Scenarios* are executable initial→final walks that cover the positive Tests, offered as a **secondary** convenience. It is an ADR-010 auxiliary service: independent of the ModelLogue GUI, runnable anywhere Python 3.10+ is available, designed for CI/CD pipelines and data-driven testing frameworks.

ModelLogue とは独立に動くテスト生成 CLI。入力は **PlantUML サブセット** または **状態遷移表 CSV**。出力は **Tests**（検証したいパターン＝主）と **Scenarios**（それらを踏む一筆書き経路＝副）。ADR-010 の補助サービス方針に従い Python で独立実装し、CI から容易に呼び出せる。

### 1.1 Tests and Scenarios / テストとシナリオ (v8.x)

A **Test** is one thing to verify. A **Scenario** is one executable walk that verifies several *positive* Tests at once. The Test is primary (what you want to check); the Scenario is the minimal-cover walk that realizes many positive Tests, offered so the whole suite can be driven in few runs.

- **Tests** (primary; default view in the GUI). Two kinds:
  - **Positive** — one per required N-switch chain `A^(N+1)` (§7.2): a single transition (`0S`), a transition pair (`1S`), or a triple (`2S`). "Starting at the chain's start state, take these transitions, expect the reached states."
  - **Negative / invalid** (`INV`) — one per invalid transition (an empty state-table cell, §7.2). A negative Test's **condition** is exactly `(state, forbidden event) → no transition`: "in this state, the forbidden event must cause no transition." It carries **only** those three facts — not a path, not a walk. How to reach the state is a *procedure* for the downstream runner, not part of the test condition, so it is not emitted. Negatives are single-cell patterns; they are **not** 0-switch positives and must never be mixed into the 0S set.
- **Scenarios** (`SC`; secondary, **positive only**). Greedy initial→final (or cycle-closing) walks that each cover multiple **positive** Tests (§7.4). A forbidden transition cannot be traversed, so it cannot sit on a walk: **negative Tests have no scenarios, and none can be constructed for them.** With `--invalid` (negatives only), the tool emits **zero** Scenarios.

**Identifiers.** Every Test and Scenario has a stable id:

```
<scope>-<type>-<NNN>
```

- `<scope>` — the machine or sub-machine name, **always present**:
  - a composite state's id for its child layer (e.g. `Operating`);
  - the caller-supplied name for the outermost machine (ModelLogue passes the **session name**; CLI/API accept `--name` / `name`);
  - `untitled` when the outermost machine is unnamed. `untitled` is chosen because it matches ModelLogue's default session name ("Untitled Session") and is a distinctive placeholder that a later rename can find-replace in one pass (`untitled-` → `<realname>-`).
- `<type>` — `0S` / `1S` / `2S` (positive), `INV` (negative), `SC` (positive scenario).
- `<NNN>` — 3-digit sequence within each `(scope, type)`.

Examples: `untitled-1S-001`, `untitled-INV-001`, `untitled-SC-001`, `Operating-1S-001`, `決済-1S-001`.

### Typical workflow / 想定ワークフロー

1. A state machine is modeled — either via the ModelLogue GUI (reviewed with AI assistance), or directly authored in PlantUML, or edited as a CSV transition table in a spreadsheet.
2. The final source is committed to version control.
3. CI invokes `modellogue-nswitch`, producing test case CSV as artifact.
4. A data-driven testing framework consumes the CSV to drive actual test execution.

### Non-goals / スコープ外

- **Full oracle generation**: for *positive* (valid-transition) tests the tool emits sequences to exercise, not expected outputs — pairing rich oracles is the downstream framework's job. *Negative* (invalid-transition) tests are the deliberate exception: they carry the minimal expectation that the invalid event causes **no improper state change**, because that assertion is the whole point of exercising an invalid cell (§7.2).
- **Layout / image output**: text and CSV only. Visual rendering stays in the GUI.
- **Beyond the ADR-009 subset**: orthogonal regions, nested composites beyond one level, history pseudo-states, and dot-notation entry are rejected at input.
- **Arbitrary N**: only N ∈ {0, 1, 2} is supported (see §3). Higher N yields combinatorial blow-up with little practical benefit for review-scale models.

---

## 2. Installation / インストール

> **Just want to try it? No install needed.** A public, no-auth demo API is live
> on the ModelLogue demo environment — a single `curl` generates N-switch tests
> without cloning or installing anything. See §9.2.7.
>
> **すぐ試すだけなら、インストール不要です。** ModelLogue のデモ環境に認証なしの
> 公開 API が動いています。`curl` 一発で、クローンもインストールもせず N-switch
> テストを生成できます（§9.2.7 参照）。

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
modellogue-nswitch [options] [input-file]     # one-shot batch mode
modellogue-nswitch serve [--port PORT] ...    # long-running HTTP server
```

- **Batch mode** (default): if `input-file` is given, reads from that file; otherwise stdin. Output written to stdout (or `-o FILE`), diagnostics to stderr. Input format is auto-detected by extension (`.puml` / `.plantuml` → PlantUML, `.csv` → CSV) or by the first non-blank line (`@startuml` → PlantUML, else CSV). Use `--format` to force.
- **Serve mode**: exposes an HTTP API for reactive callers (the ModelLogue GUI, CI dashboards, etc.). See §9.2 for the endpoint contract. Triggered by the literal subcommand `serve`.

### Options / オプション

| Option | Default | Description |
|---|---|---|
| `-n N`, `--n N` | `1` | N-switch level for **positive** tests. Accepted values: **0 / 1 / 2** only. N=0 exercises each transition once; N=1 each transition pair; N=2 each triple. |
| `--invalid` | off | Also emit **negative** (`INV`) Tests: one per invalid transition (empty state-table cell, §7.2). Orthogonal to `-n`. With `--invalid` and no `-n`, only negative Tests are produced. |
| `--name NAME` | `untitled` | Scope name for the outermost machine — prefixes Test / Scenario ids as `<NAME>-<type>-<NNN>` (§1.1). Composite sub-machines always use their own state id. Default `untitled`. |
| `--format puml\|csv` | auto | Force input format. |
| `-o FILE`, `--output FILE` | stdout | Write output to FILE instead of stdout. |
| `--coverage` | off | Emit coverage-report CSV (which tests cover which transitions / chains) instead of the default test-case CSV. |
| `--layered` / `--no-layered` | `--layered` | Apply the per-composite layered strategy. With `--no-layered`, composites are treated as opaque leaf states (no child-layer tests). |
| `--max-cycle-unroll K` | `3` | Per-test cap on how many times any single transition may be traversed during **path construction** (§7.4). Prevents combinatorial blow-up on cyclic state machines. Does NOT apply to matrix-power enumeration (§7.2), which is already bounded by N ≤ 2. |
| `--require-final` | off | Error out (exit 2) if the model has no initial→final reachable path. Default behavior accepts cyclic / mainloop-style models and generates tests that close on a revisited state — see §7.4. |
| `-h`, `--help` | — | Show help and exit. |
| `--version` | — | Show version and exit. |

### Serve-mode options / serve モードオプション

When invoked as `modellogue-nswitch serve [...]`, only the following options apply (the batch-mode flags are rejected in this mode):

| Option | Default | Description |
|---|---|---|
| `--host HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to accept connections from outside the loopback (e.g. a Docker service). |
| `--port PORT` | `8090` | TCP port. 8090 avoids collisions with PlantUML Server (8080) and n8n (5678). |
| `--cors-origin ORIGIN` | `*` | Value for `Access-Control-Allow-Origin`. Set explicitly (e.g. `http://localhost:5173`) when exposing beyond loopback. |

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

RFC 4180 CSV, UTF-8, LF line endings. Two outputs: **Tests** (§6.1, primary) and **Scenarios** (§6.2, secondary). Ids follow §1.1.

**State naming — the output shows what the diagram shows (§7.5).** Every state cell (`start`, `reached_i`) carries the state's **diagram label**, not an internal id: if the source declares `state "待機" as Idle`, the tables say `待機`. The two pseudo-state markers, which appear on the diagram as circles rather than text, are handled specially:

- The **initial marker** (`●`) is *not a state* — it only points at where the machine begins. It is **never emitted**, and neither is the automatic entry step out of it: a walk starts directly at the first real state.
- The **final marker** (`◉`) is rendered as `(*)` in a `reached` cell (the transition into it — e.g. a real `done` event — is kept; only its destination is the terminal marker).

`()` in an `event` cell still means "a real transition with no event name" (a completion transition such as `A --> B`); it is unrelated to the (now-removed) entry step.

### 6.1 Tests CSV (default)

One row per **Test** (§1.1) — the primary artifact. **Machine-friendly columnar layout**: the `start` state, then each `(event, reached)` step in its **own columns** — no packed `A--e-->B` string. One consistent label `reached` = the state reached by that event (the last `reached` is *not* specially named — no "next" / "end"). Columns are uniform within a level, so a data-driven runner reads column *k* directly and a spreadsheet can sort/filter per step. Headers are English.

**Positive Tests** — a level-N Test is N+1 **real** consecutive transitions (a chain that would begin at the machine-entry marker is not a Test; §7.5), so all rows at a level are uniform:

| Column | Meaning |
|---|---|
| `seq` | 1-based row number within the file (= the running count). |
| `id` | `<scope>-<type>-<NNN>` (§1.1), e.g. `untitled-2S-001`. |
| `start` | Diagram label of the real state the Test starts at (never the initial marker — that is not a state, and no Test begins there). |
| `event_i`, `reached_i` | for i = 1 … N+1: the i-th event and the state it reaches (diagram label, or `(*)` for the final marker). |
| `scenarios` | Semicolon-separated Scenario ids (§6.2) that exercise this Test. |

Example (2-switch = 3 transitions → `event_1..3` / `reached_1..3`; labels shown, final as `(*)`):

```csv
seq,id,start,event_1,reached_1,event_2,reached_2,event_3,reached_3,scenarios
1,untitled-2S-001,待機,start,動作,fault,故障,reset,待機,untitled-SC-001
2,untitled-2S-002,待機,start,動作,stop,待機,start,動作,untitled-SC-002
```

**Negative Tests (`INV`)** — a fixed, separate shape (one per invalid cell; §7.2). Selecting `INV` yields negative Tests **only** — positive `0S` Tests are never mixed in (they are a different type; §1.1). A negative Test is a pure `(state, forbidden event) → no-transition` condition; it carries no path and references no Scenario (§1.1).

| Column | Meaning |
|---|---|
| `seq` | 1-based row number. |
| `id` | `<scope>-INV-<NNN>`. |
| `start` | The state where the forbidden event is injected. |
| `event` | The forbidden event. |
| `expect` | `no-transition` — must be rejected with no state change. |

```csv
seq,id,start,event,expect
1,untitled-INV-001,Active,start,no-transition
```

### 6.2 Scenarios CSV (secondary)

One row per **Scenario** (§1.1) — a greedy walk (from the first real state to the final marker, or cycle-closing) covering several positive Tests (§7.4). Secondary output; negatives never appear here. Same columnar `(event, reached)` layout as positive Tests, but walks vary in length, so trailing `event_i` / `reached_i` cells are empty for shorter walks.

| Column | Meaning |
|---|---|
| `seq` | 1-based row number. |
| `id` | `<scope>-SC-<NNN>`. |
| `start` | Diagram label of the **first real state** the walk begins at (the initial marker and its entry step are not emitted; §7.5). |
| `event_i`, `reached_i` | the i-th step; `reached` is a diagram label or `(*)` for the final marker; empty past the walk's length. |
| `covers` | Semicolon-separated Test ids this Scenario exercises. |

```csv
seq,id,start,event_1,reached_1,event_2,reached_2,event_3,reached_3,covers
1,untitled-SC-001,待機,start,動作,fault,故障,,,untitled-0S-001;untitled-1S-001
2,untitled-SC-002,待機,start,動作,stop,待機,,,untitled-0S-002;untitled-1S-002
```

### 6.3 Canonicality / 決定論

For the same input and the same option values, the tool produces **byte-identical output** across runs, machines, and Python versions within 3.10+. Sort keys:

- Tests ordered by `(scope, type, seq)`; scopes sort outermost-first then composite ids alphabetically; within a `(scope, type)`, `seq`/`NNN` follow the canonical chain order (the required chains are enumerated by canonical chain string).
- Scenarios ordered by `(scope, seq)`, in construction order.
- A Test's `scenarios` list and a Scenario's `covers` list are sorted by id.

This satisfies ADR-011: CI diffs on generated artifacts are meaningful.

---

## 7. Algorithm / アルゴリズム

> **Bridge to §1.1:** the required chains (§7.2) are the positive **Tests**; the invalid cells (§7.2) are the negative (`INV`) **Tests**; the greedy cover paths (§7.4) are the **Scenarios**. The algorithm below is unchanged by the v8.x Tests/Scenarios reframe — only the output naming/ids (§6, §1.1) changed.

### 7.1 Flattening / 平坦化 (ADR-009 revision)

ModelLogue's state-diagram subset permits **one level of composite states** (ADR-009). For test generation, composites are **flattened** (inlined one level) into a **single layer**, and the ordinary N-switch of §7.2 runs over that flat machine.

**Why not layered testing.** An earlier design tested each composite as a black box in the parent *plus* its internals as a separate sub-model. That silently **drops boundary-crossing sequences** (enter a composite → transition internally → escape, as one chain) and makes the test count depend on how the model was drawn — a composite and its hand-flattened equivalent yield different suites, and the black-box view even reports a spurious invalid cell for an event the composite consumes internally. For a test-generation tool that under-coverage is unacceptable, so layered testing is not used. One-level composites (ADR-009) keep the flattened machine bounded.

**Mechanical expansion** (per composite `C`, purely structural):

- `C`'s children are **promoted** to the top level; the composite node itself disappears.
- An **entry** into `C` (`X --ev--> C`) is redirected to `C`'s internal initial child (`X --ev--> Running`).
- A **group-escape** from `C` (`C --ev--> Y`) is replicated from **every** child of `C` (`Running --ev--> Y`, `Paused --ev--> Y`).
- Internal transitions are kept as-is.
- `C`'s internal-initial edge is dropped (folded into the entry redirect); a transition into `C`'s internal final maps to the machine's `[*]_final`.

The result is one self-contained layer with pseudo-states `[*]_init` / `[*]_final`; every state cell is really handled, so no spurious invalids arise. **A composite model and its hand-flattened equivalent produce byte-identical tests.**

### 7.2 Path-algebra matrix / 経路代数行列

Per layer we build a square matrix `A` indexed by the layer's states.

- **Element type**: a set of transition sequences. Each sequence is an ordered tuple of transitions; a singleton tuple represents one direct transition.
- **Base `A`** (the matrix of length-1 sequences): `A[i][j] = { (t,) | t ∈ transitions, t.source = i, t.target = j }`. Pairs with no direct transition yield `∅`.
- **Semiring**: `(P(Seq), ∪, ⊗)` where `P(Seq)` is the powerset of sequences, `∪` is set union, and `⊗` is pairwise concatenation-and-union: `a ⊗ b = { s_a ++ s_b | s_a ∈ a, s_b ∈ b }`.
- **Matrix product**: `(A · B)[i][j] = ⋃_k (A[i][k] ⊗ B[k][j])`.
- **Powers**: `A^k[i][j]` is the set of every transition sequence of length exactly `k` that takes the machine from `i` to `j`.

**From diagram to state table (same information, different use).** For test design the diagram alone is not enough; standard state-transition testing (ISTQB) builds the **state-transition table**, precisely because the diagram shows only the drawn (valid) transitions while the *table* forces every `(state, event)` combination into view. The table is **derived**, not authored — it carries no information the diagram doesn't already imply. Given the layer's states and its event alphabet `Sigma` (all events on any transition in the layer), each cell `(S, E)` is either a **valid transition** (drawn) or **empty** (no drawn transition = an *invalid / forbidden transition*). The empty cells are the whole reason the table is mandatory: they surface the combinations the diagram hides.

Why the empty cells matter for software: in **hardware** an unhandled `(S, E)` is inherently a safe no-op (the state holds); in **software** it is undefined behavior (fall-through, exception, runaway), which is exactly where defects and security holes live. So the empty cells are worth testing.

**Coverage levels** (standard names, increasing strength):

| Level | Obligation |
|---|---|
| all valid transitions (**0-switch**) | every drawn transition exercised once — a **positive** test |
| **all transitions incl. invalid** | additionally, every empty cell exercised — a **negative** test: reach `S`, inject `E`, assert **no improper transition** (the machine rejects or safely absorbs the event and does not enter a wrong/undefined state) |
| **N-switch** (`N ∈ {1, 2}`) | every valid transition sequence of length `N+1` exercised (positive), built over the drawn transitions |

Formally, per layer:

```
Valid[layer]   = ⋃_{i,j} A^(N+1)[i][j]                                     # positive: valid (N+1)-chains (classic N-switch)
Invalid[layer] = { (S, E) | S ∈ states, E ∈ Sigma, ∄ t: t.source = S ∧ t.event = E }   # negative: empty cells
```

Every chain in `Valid[layer]` must appear in at least one positive test; every cell in `Invalid[layer]` must be exercised by one negative test. The positive side is unchanged from classic N-switch; the negative side is the "all transitions including invalid" upgrade that the derived state table exposes. No new diagram notation and no per-cell authoring is required — the machine is not changed, only used more completely.

### 7.3 Cycle guard / サイクル抑制

**Scope of the cap** — `--max-cycle-unroll K` applies **only** to path construction (§7.4). Specifically, the prefix `p1` and suffix `p2` searches reject any path that traverses the same transition more than K times. The matrix-power enumeration (§7.2) is bounded by `N ≤ 2` and needs no runtime cap.

If a required chain in `Valid[layer]` cannot be embedded in any finite path respecting the cap, it is reported as **uncovered** in the coverage report (`status=unreachable-within-cap`), and the process exits with code `3` after emitting the rest of the tests.

The default `K = 3` is generous enough for realistic review-scale models under `N ≤ 2`.

### 7.4 Test case construction / テストケース生成

Per layer, given the positive coverage set `Valid[layer]` (§7.2):

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

**Negative tests (invalid transitions).** When `--invalid` is set, after the positive cover the tool constructs one negative test per element of `Invalid[layer]` (§7.2 — every `(S, E)` with no drawn transition on `E` from `S`):

1. Enumerate the invalid cells: for each state `S` (excluding pseudo-states) and each event `E ∈ Sigma`, if no transition leaves `S` on `E`, `(S, E)` is invalid.
2. For each, confirm `S` is **reachable**: a greedy shortest path from the layer's initial pseudo-state to `S` must exist within the cycle-unroll cap. This reachability check is the *only* use of path finding here — the path itself is **not** emitted (reaching `S` is a runner procedure, not part of the test condition; §1.1). If `S` is unreachable within the cap, the cell is reported `unreachable-within-cap` (exit 3 / `uncovered`), same as a positive chain.
3. Emit a `negative` test with exactly three facts: `start` = `S`, `event` = `E`, `expect` = `no-transition`. No `sequence`, no path, no Scenario reference.

Negative construction is **deterministic and reachability-bounded**: only invalid cells whose source state is reachable produce a test. Because a forbidden event cannot be traversed, a negative Test cannot sit on any walk, so **no Scenario is produced for it** — with `--invalid` (negatives only) the Scenario set is empty. Invalid cells add no chains to `A` and do not change positive N-switch output.

### 7.5 Pseudo-state spelling conventions

**Internal ids** (used only inside the algorithm, never in §6 output):

- Top-layer initial: `[*]_init`. Final: `[*]_final`.
- Per-composite `X`: initial `[*]_init_X`, final `[*]_final_X`.

**Output rendering** (§6) maps these to what the diagram shows:

- Real states → their **diagram label** (`Idle` declared as `state "待機" as Idle` → `待機`).
- The **initial marker** (`●`) is not a state and "entering the machine" is not a transition to test. It never appears in `start` or `reached`. Concretely:
  - **Tests** are patterns over *real* transitions: a chain that begins at the initial marker is excluded (the real transition it carries — e.g. the first `start` — is already covered by a chain that begins at a real state, so keeping it would only add a redundant, entry-stripped duplicate).
  - **Scenarios** are walks from the machine's entry; the leading entry step is stripped for display so the walk simply starts at the first real state.
- The **final marker** (`◉`) → `(*)` in a `reached` cell. The transition *into* it (a real event, or `()` for an unlabeled completion transition) is kept; only its destination is the terminal marker.
- `()` in an `event` cell means "a real transition with no event name" (e.g. `A --> B`).
- An **invalid transition** (empty state-table cell) is a negative Test: `(state, event) → no-transition` (§6.1). It is not spelled as an arrow; there is no target.

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

## 9. Programmatic APIs / プログラムからの呼び出し

The tool exposes two programmatic surfaces over the same core: an **in-process Python API** (§9.1) for frameworks that embed the library, and an **HTTP API** (§9.2) for the ModelLogue GUI and other out-of-process callers. Both consume the same internal `StateMachineModel` and emit the same `GenerationResult`.

### 9.1 Python API / Python ライブラリ

```python
from modellogue_nswitch import generate, parse_puml, parse_csv

# From PlantUML string
result = generate(parse_puml(source_string), n=1, layered=True)

# Positive N-switch plus negative (invalid-transition) tests
result = generate(parse_puml(source_string), n=1, invalid=True)

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

### 9.2 HTTP API / HTTP API

Launched with `modellogue-nswitch serve`. Implemented on top of Python's stdlib `http.server` — no runtime dependencies beyond the standard library, consistent with §4.1.1.

Default bind: `127.0.0.1:8090`. See the Serve-mode options table in §3 for `--host` / `--port` / `--cors-origin`.

#### 9.2.1 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe. Returns `{"status": "ok", "version": "<x.y.z>"}`. Safe to poll at high frequency. |
| `POST` | `/generate` | Parse + generate test cases. Body JSON shape in §9.2.2. |
| `OPTIONS` | `*` | CORS preflight. Echoes `Access-Control-Allow-Origin` per `--cors-origin`. |

All successful responses are JSON with `Content-Type: application/json; charset=utf-8`. Errors return `{"error": {"type": "...", "message": "..."}}` with the appropriate HTTP status code.

#### 9.2.2 POST /generate — request

```json
{
  "source": "@startuml\n[*] --> A\n...\n@enduml",
  "format": "puml",
  "n": 1,
  "invalid": false,
  "layered": true,
  "max_cycle_unroll": 3,
  "require_final": false
}
```

Fields:

| Field | Type | Default | Notes |
|---|---|---|---|
| `source` | string | — (required) | The PlantUML source or canonical CSV text. |
| `format` | `"puml"` \| `"csv"` \| `null` | auto | Explicit when the caller already knows; otherwise the server auto-detects using the same rule as the CLI (§3). |
| `n` | 0 \| 1 \| 2 | `1` | N-switch level (positive tests). |
| `invalid` | boolean | `false` | Also emit negative (`INV`) Tests, one per empty state-table cell (§7.2). Orthogonal to `n`. |
| `name` | string | `"untitled"` | Scope name for the outermost machine; prefixes ids as `<name>-<type>-<NNN>` (§1.1). ModelLogue passes the session name. |
| `layered` | boolean | `true` | Per §7.1. |
| `max_cycle_unroll` | integer ≥ 1 | `3` | Per §7.3. |
| `require_final` | boolean | `false` | Per §7.4. |

#### 9.2.3 POST /generate — response (200 OK)

```json
{
  "tests": [
    {
      "id": "order-1S-001",
      "type": "1S",
      "scope": "order",
      "start": "A",
      "steps": [
        { "event": "go", "reached": "B" },
        { "event": "done", "reached": "(*)" }
      ],
      "event": "",
      "expect": "",
      "scenarios": ["order-SC-001"]
    },
    {
      "id": "order-INV-001",
      "type": "INV",
      "scope": "order",
      "start": "B",
      "steps": [],
      "event": "go",
      "expect": "no-transition",
      "scenarios": []
    }
  ],
  "scenarios": [
    {
      "id": "order-SC-001",
      "scope": "order",
      "start": "A",
      "steps": [
        { "event": "go", "reached": "B" },
        { "event": "done", "reached": "(*)" }
      ],
      "covers": ["order-1S-001"]
    }
  ],
  "uncovered": [],
  "scopes": ["order"]
}
```

The shape mirrors `dataclasses.asdict(generate(...))` exactly — the server is a JSON transport on top of the Python API (§1.1, Tests / Scenarios), so behaviour is identical.

- **`tests[]`** — one verification pattern each. A **positive** N-switch Test (`type` = `0S` / `1S` / `2S`) carries the covered chain as `steps[]` (`{event, reached}`, where `reached` is `(*)` for the final state) plus the `scenarios[]` that exercise it; its `event` / `expect` stay empty. A **negative** Test (`type` = `INV`, emitted only when `invalid: true`) has empty `steps` and instead names the forbidden `event` injected at `start` with `expect: "no-transition"` (§7.2). Ids are `<scope>-<type>-<NNN>`.
- **`scenarios[]`** — executable walks, each covering one or more positive Tests via `covers[]`. Ids are `<scope>-SC-<NNN>`. (Negative `INV` Tests have no scenarios.)
- **`uncovered[]`** — chains that can neither reach a final state nor close a cycle within `max_cycle_unroll` (§7.3). Each entry is `{ "scope", "chain": [{ "source", "target", "event", "guard", "action" }], "reason" }`. This is a warning surfaced in the payload, **not** an error — the HTTP status stays `200` (§9.2.4). Empty when everything is covered.
- **`scopes[]`** — the scope names present: the outermost machine plus any nested composites (§1.1).

#### 9.2.4 POST /generate — error responses

| HTTP | `error.type` | Trigger |
|---|---|---|
| `400` | `parse_error` | PlantUML or CSV input rejected by the respective parser. `error.message` carries the line number and reason. |
| `400` | `invalid_request` | Malformed JSON, missing `source`, invalid `n`, unknown field, etc. |
| `422` | `unsatisfiable` | `require_final: true` and the model has no initial→final path. Analogue of CLI exit 2. |
| `405` | `method_not_allowed` | Wrong HTTP method for the path. |
| `500` | `internal_error` | Unexpected exception from the library. Logged server-side; response contains a generic message. |

Uncovered chains caused by `--max-cycle-unroll` **do not** return an error — they appear in `response.uncovered` with status `"unreachable-within-cap"`. The analogue of CLI exit 3 is a warning state surfaced in the payload; the HTTP status stays `200`.

#### 9.2.5 CORS

- `Access-Control-Allow-Origin`: value of `--cors-origin` (default `*`).
- `Access-Control-Allow-Methods`: `GET, POST, OPTIONS`.
- `Access-Control-Allow-Headers`: `Content-Type`.
- Preflight responses are `204 No Content`.

When the server runs inside docker-compose alongside the SPA's dev server, set `--cors-origin http://localhost:5173` in production configurations to narrow the accept-list. The default `*` is convenient for local development only.

#### 9.2.6 Determinism & caching

Identical request bodies yield byte-identical responses (ADR-011). Clients MAY cache responses keyed by a hash of the request JSON; the server does not implement HTTP caching headers because the generation is cheap for review-scale models (sub-10ms typical) and cache invalidation would need to track code version plus input anyway.

#### 9.2.7 Try it on the demo environment / デモ環境で試す

A public, **no-auth** instance of this API runs on the ModelLogue demo
environment, so anyone can try N-switch generation **without installing
anything**. It is the same code as the CLI (`serve` mode), reached through the
app's same-origin `/nswitch` prefix.

- **Base URL:** `https://modellogue.com/nswitch`
- No API key / no sign-in — test generation holds no secrets.
- Best-effort demo / staging: expect occasional brief restarts; don't depend on
  it for production CI (install locally per §2 for that).

**Liveness check:**

```bash
curl https://modellogue.com/nswitch/health
# → {"status": "ok", "version": "0.1.0"}
```

**Generate 1-switch tests from a PlantUML state machine:**

```bash
curl -X POST https://modellogue.com/nswitch/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "@startuml\n[*] --> A\nA --> B : go\nB --> [*] : done\n@enduml",
    "n": 1,
    "name": "smoke"
  }'
```

Response (the current **Tests + Scenarios** shape, §1.1; trimmed):

```json
{
  "tests": [
    { "id": "smoke-1S-001", "type": "1S", "scope": "smoke", "start": "A",
      "steps": [ {"event": "go", "reached": "B"}, {"event": "done", "reached": "(*)"} ],
      "scenarios": ["smoke-SC-001"] }
  ],
  "scenarios": [
    { "id": "smoke-SC-001", "scope": "smoke", "start": "A",
      "steps": [ {"event": "go", "reached": "B"}, {"event": "done", "reached": "(*)"} ],
      "covers": ["smoke-1S-001"] }
  ],
  "uncovered": [],
  "scopes": ["smoke"]
}
```

Tune with the same fields as §9.2.2 — for example `"n": 2` for 2-switch coverage,
`"invalid": true` to add negative (invalid-transition) tests, or `"format": "csv"`
to feed a canonical transition table (§4.2) instead of PlantUML.

**日本語：** この API は ModelLogue の**デモ環境で認証なしの公開インスタンス**として
動いており、誰でも**インストールせずに** N-switch 生成を試せます。CLI と同じコード
（`serve` モード）で、アプリと同一オリジンの `/nswitch` 経由で到達します。

- **ベース URL：** `https://modellogue.com/nswitch`
- API キー不要・サインイン不要（テスト生成に秘密情報は無いため）。
- デモ／ステージングにつきベストエフォート（時々の短い再起動あり）。本番 CI の依存先には
  せず、その用途は §2 のローカルインストールを使ってください。

疎通確認と生成は上の `curl` のとおり。パラメータは §9.2.2 と同じで、`"n": 2`（2-switch）、
`"invalid": true`（無効遷移の否定テストを追加）、`"format": "csv"`（PlantUML の代わりに
正準遷移表 CSV を投入）などを指定できます。

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
- **Matrix-power coverage** — small hand-checked models where `Valid[layer]` is enumerated by hand and compared against `A^(N+1)` output, for N ∈ {0, 1, 2}.
- **Invalid-transition coverage** — hand-checked models where the empty state-table cells `Invalid[layer]` are enumerated by hand and compared against the negative tests emitted with `--invalid` (§7.2 / §7.4).
- **Byte-deterministic output** — run the generator twice on each fixture and assert output byte equality (ADR-011).

The EBNF file itself is not parsed at runtime; instead, "the parser accepts exactly what the EBNF says" is continuously verified by the conformance suite. When the EBNF is intentionally extended, the suite is extended first (red), then the parser (green) — doc-first / spec-first per `CLAUDE.md`.
