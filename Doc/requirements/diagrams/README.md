# ModelLogue requirement diagrams (dogfood)

This directory holds two views of ModelLogue's own requirements,
expressed via the requirement-diagram model type. The point is to
exercise the v7.5 feature on the project's actual data and capture
what we learn.

## Files

| Pair | Hand-written `.puml` | CSV-driven |
|---|---|---|
| User level (UR-001 .. UR-015) | [user-level.puml](user-level.puml) | [user-level.csv](user-level.csv) → [user-level.from-csv.puml](user-level.from-csv.puml) |
| System level (SR-001 .. SR-125) | [system-level.puml](system-level.puml) | [system-level.csv](system-level.csv) → [system-level.from-csv.puml](system-level.from-csv.puml) |

The `*.from-csv.puml` files are generated mechanically from the
matching CSV via `csvParser → modelToPlantUml` (the same pipeline
SR-116 uses on AI replies). Regenerate with:

```
REGEN_FROM_CSV=1 npx vitest run tests/unit/projectRequirementDiagramsFromCsv
```

Without `REGEN_FROM_CSV`, the test asserts byte-equality between the
on-disk `.from-csv.puml` and what the converter produces from the
CSV (deterministic per ADR-011).

## Why two paths

The requirement-diagram model type accepts inputs in two shapes:

1. **Macro-DSL `.puml`** — what the parser ultimately consumes and
   what PlantUML Server renders. Authoring it by hand is what I did
   first.
2. **Semi-structured CSV** — the canonical exchange format with the
   AI (`id, statement, type, text, contained_in, derives_from,
   hidden, deleted, note`, per SR-113). The runtime regenerates the
   canonical `.puml` from it via SR-116.

For state-machine and process-diagram sessions the user authors
PlantUML directly. For requirement sessions the input is a table
(or natural language → AI → table); writing PlantUML by hand
sidesteps the intended modality. Producing both pairs lets us
compare what each lens does to the same data.

## What the comparison shows

### Visual scale

| | hand-written | CSV-driven | ratio |
|---|---|---|---|
| user-level: SVG viewBox | 2132 × 436 px | 2396 × 345 px | similar |
| system-level: SVG viewBox | 8325 × 745 px | **24919 × 361 px** | **3× wider** |

The CSV-driven system-level lays all 65 boxes out in a single tall
strip because PlantUML's auto-layout has nothing to anchor the
grouping. Without packages it falls back to "left-to-right pile of
classes connected by dashed arrows", which sprawls horizontally as
the node count grows. The hand-written version, with 11
`package <<Frame>> { ... }` blocks, gives PlantUML a 2D grid hint
and the layout compresses.

### What each input modality can express

| | hand-written `.puml` | CSV |
|---|---|---|
| Visual grouping (`package <<Frame>> { ... }`) | yes | **no** — no `package` column |
| `$contain` relation | yes | yes (`contained_in`) — but `$contain` is logical containment, NOT a visual frame in PlantUML class diagrams |
| `$derive` arrows | yes | yes (`derives_from`, semicolon-separated) |
| Title / decorative comments | yes | **no** — converter emits a fixed shape |
| Cross-level UR ↔ SR trace | possible (would need both layers in one source) | natural — both can be rows in one CSV |
| Round-trip determinism | unspecified (formatting drift possible) | guaranteed (ADR-011) |
| Authoring ergonomics for 50+ rows | tedious | one-row-per-line table |

The CSV format **does not have a package column**. That's a real
expressiveness gap between the two paths: the hand-written
`system-level.puml` groups SRs by area as a review-comprehension
device; the CSV-driven version cannot reproduce that.

The observation isn't "the CSV format is incomplete" — it is by
design SR-113-shaped, designed to be flat and to round-trip with
the AI. Visual grouping in a requirement diagram is more of a
diagram-author decision than a data property; if it matters,
authoring `.puml` by hand (or augmenting the AI reply) is the right
escape hatch.

### Does the CSV path capture the trace better?

In the system-level pair, only the CSV-driven version actually
draws the UR ↔ SR derive arrows because the CSV had room to list
both UR and SR rows side-by-side. The hand-written version
deliberately omitted them — 80+ arrows on top of 65 nodes is
visually overwhelming and `Doc/Traceability.md` already carries
the matrix.

So the two artifacts answer different review questions:

- **`system-level.puml` (hand-written, packages, no arrows)** —
  "What functions are we shipping, grouped by area?" Skim-friendly.
- **`system-level.from-csv.puml` (flat, all arrows)** —
  "Which URs does each SR descend from? Are any SRs orphaned?"
  Trace-friendly, requires zoom.

Neither replaces the other.

## What dogfooding revealed

Running the project's own UR / SR through the requirement-diagram
pipeline surfaced one real bug:

**preamble-relation hyphen-ID rendering bug** (fixed in the
companion commit). The canonical `!procedure` preamble expanded
relation arguments without quoting (`$Supplier <.. $Client`), which
PlantUML's class-diagram parser reads as a subtraction expression
when the alias contains a hyphen (`UR-001 <.. UR-003` → `Syntax
Error`). All existing requirement-parser tests use unhyphenated IDs
(`R1`, `P`, `C`, …), so the case never fired. Dogfooding with
real `UR-NNN` / `SR-NNN` style is what surfaced it.

The fix wraps the variable expansions in `"..."`. No-op for
unhyphenated IDs; rescues the hyphenated case.
