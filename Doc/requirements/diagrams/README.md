# ModelLogue requirement diagrams (dogfood)

Three views of ModelLogue's own requirements expressed as SR-113 CSV
inputs to the requirement-diagram model type. The point is to exercise
the v7.5 + v7.7 (ADR-015) features on the project's actual data, with
each diagram answering a single review question.

## Files (3 review purposes × 1 axis each, per ADR-015)

| Review purpose | Axis | CSV (input) | Generated `.puml` |
|---|---|---|---|
| UR area inventory: how the user-facing tasks split across review targets | `group` | [urs.csv](urs.csv) | [urs.from-csv.puml](urs.from-csv.puml) |
| SR component inventory: which functions land in which area of the codebase | `group` | [srs.csv](srs.csv) | [srs.from-csv.puml](srs.from-csv.puml) |
| Cross-tier coverage: every UR realised by ≥ 1 SR, every SR traced to a UR | `level` | [coverage.csv](coverage.csv) | [coverage.from-csv.puml](coverage.from-csv.puml) |

The `*.from-csv.puml` files are generated mechanically from the
matching CSV via `csvParser → modelToPlantUml(model, axis)` (the same
pipeline SR-116 uses on AI replies). Regenerate with:

```
REGEN_FROM_CSV=1 npx vitest run tests/unit/projectRequirementDiagramsFromCsv
```

Without `REGEN_FROM_CSV`, the test asserts byte-equality between the
on-disk `.from-csv.puml` and what the converter produces from the
CSV (deterministic per ADR-011).

## ADR-015 in action: one axis per review

The CSV has 11 columns:
`id, statement, type, text, contained_in, derives_from, hidden,
deleted, note, level, group`

Each of the three CSVs uses **exactly one** of `level` / `group` as
its visual grouping axis (the other column is empty on every row):

- **urs.csv** — `level` empty, `group` set to one of `状態遷移図のレビュー / 要求図のレビュー / プロセス図のレビュー / 共通レビュー機能 / 補助機能`. Generates 5 `package <<Frame>>` blocks at axis = group.
- **srs.csv** — `level` empty, `group` set to the YAML section name (Source editing / Diagram display / … / Process diagram). Generates 12 packages.
- **coverage.csv** — `level` set to `user` for UR rows and `system` for SR rows, `group` empty on every row. `derives_from` connects each SR to its parent UR(s). Generates 2 packages plus ~65 cross-tier `$derive` arrows.

Mixing both axes (populating `level` and `group` on the same CSV) is
forbidden by convention (ADR-015 / SR-118 / n8n prompt). The data
model is orthogonal so it would technically work, but the resulting
diagram answers no clear review question.

## Layout direction (empirical finding)

The generator emits `left to right direction` whenever any package
block is present. With the alternative `top to bottom direction`,
PlantUML's class-diagram layout collapses the cross-tier coverage
case into a near-flat single row (28177 × 293 px) because the many-
to-many derive arrows dominate the layout solver. With
`left to right direction`, packages stack vertically and within-
package elements arrange horizontally, giving a usable tall-and-
narrow shape:

| Diagram | viewBox (px) | nodes | package blocks |
|---|---|---|---|
| urs.from-csv | 1095 × 1084 | 15 | 5 |
| srs.from-csv | 2329 × 3052 | 52 | 12 |
| coverage.from-csv | 1693 × 5255 | 67 | 2 (level=user / level=system) |

For comparison, the dogfood that surfaced ADR-015 produced a
`system-level.from-csv.puml` of 24919 × 361 px — flat, no packages,
unreadable. The new pipeline replaces that with `srs.from-csv.puml`
(2329 × 3052) for the same data.

## What this dogfood teaches

1. **The CSV format is sufficient for review-purpose-specific diagrams.** The same project can produce three distinct review artifacts from three CSV files, each answering a single review question.
2. **One axis per review is enforceable by author discipline.** No tooling police. The CSV format permits both `level` and `group` on the same row; the n8n prompt and this README state the rule.
3. **PlantUML layout is sensitive to direction.** `left to right direction` is the better default for class-diagram requirement views with cross-package edges, even when the abstract intent is "UR on top, SR on bottom" (level packages stack vertically; the actual UR ↔ SR arrows flow left to right within the tall layout).
4. **Free-text `group` doesn't lose review value.** It can carry the YAML section names verbatim, so the diagram author doesn't need to invent a separate taxonomy.

## Found and fixed during dogfooding

- **Preamble hyphen-ID rendering** ([f5f98e7](https://github.com/sho1884/ModelLogue/commit/f5f98e7)): the canonical macro preamble expanded relation arguments without quoting, which PlantUML's class-diagram parser misread as subtraction expressions for hyphenated identifiers (`UR-001 <.. UR-003 → Syntax Error`). Wrapped variables in `"..."` in `$contain / $derive / $refine / $satisfy / $verify / $trace / $copy`. No-op for unhyphenated IDs.
- **Diagram pane silent failure** ([035a5aa](https://github.com/sho1884/ModelLogue/commit/035a5aa)): when PlantUML rejected a source, `fetchSvg` threw and the modelStore left `svgString` untouched, so the diagram pane kept showing the previous (or seed) image. Now the error message is parsed out of PlantUML's self-rendered error SVG and surfaced via `svgFetchError`, with the stale SVG cleared.
- **EBNF v1.2.2 / process diagram swimlane ordering** ([035a5aa](https://github.com/sho1884/ModelLogue/commit/035a5aa)): tightened the parser/spec to reject the first-ever `|...|` swimlane after `start` (PlantUML hard-rejects this regardless), and added rejected corpus test 12.
