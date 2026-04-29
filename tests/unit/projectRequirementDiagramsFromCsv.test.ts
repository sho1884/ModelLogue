// Regenerator + verifier for the CSV-driven companion diagrams under
// Doc/requirements/diagrams/.
//
// Each .csv is the SR-113 canonical CSV format (id, statement, type,
// text, contained_in, derives_from, hidden, deleted, note). The
// CSV → RequirementModel → PlantUML pipeline is the same one the
// runtime uses when an AI returns a CSV reply (SR-116). Per ADR-011
// it is deterministic, so `*.from-csv.puml` on disk must always match
// what the converter produces from the CSV input. Drift triggers a
// failed assertion; rerun this test to regenerate.

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parseRequirementsCsv } from '../../src/modelTypes/requirement/csvParser';
import { modelToPlantUml } from '../../src/modelTypes/requirement/plantUmlGenerator';
import { parse } from '../../src/modelTypes/requirement/parser';

interface Pair {
  csv: string;
  puml: string;
}

const PAIRS: Pair[] = [
  // UR-only inventory, grouped by review-target area (group axis).
  {
    csv: 'Doc/requirements/diagrams/urs.csv',
    puml: 'Doc/requirements/diagrams/urs.from-csv.puml',
  },
  // SR-only inventory, grouped by component area (group axis).
  {
    csv: 'Doc/requirements/diagrams/srs.csv',
    puml: 'Doc/requirements/diagrams/srs.from-csv.puml',
  },
  // Cross-tier coverage: UR + SR, grouped by abstraction level (level axis).
  {
    csv: 'Doc/requirements/diagrams/coverage.csv',
    puml: 'Doc/requirements/diagrams/coverage.from-csv.puml',
  },
  // Hierarchical coverage demo (small fixture): both UR and SR sides
  // have internal contained_in hierarchies, plus cross-tier derive
  // arrows. Documents how the package + composition arrows render
  // when both levels have nested structure (per dogfood Q&A in README).
  {
    csv: 'Doc/requirements/diagrams/coverage-hierarchical.csv',
    puml: 'Doc/requirements/diagrams/coverage-hierarchical.from-csv.puml',
  },
];

const REGEN = process.env.REGEN_FROM_CSV === '1';

describe('CSV-driven requirement diagrams', () => {
  for (const { csv, puml } of PAIRS) {
    it(`${csv} → ${puml} round-trips through csvParser → modelToPlantUml → parse`, () => {
      const csvText = readFileSync(csv, 'utf-8');
      const csvResult = parseRequirementsCsv(csvText);
      if (csvResult.errors.length > 0) {
        throw new Error(
          'CSV parse errors:\n' +
            csvResult.errors
              .map((e) => `  L${e.line}: ${e.message}`)
              .join('\n')
        );
      }
      expect(csvResult.model).not.toBeNull();
      const generated = modelToPlantUml(csvResult.model!);

      // The generated PlantUML must itself parse cleanly.
      const reparsed = parse(generated);
      if (reparsed.errors.length > 0) {
        throw new Error(
          'Generated PlantUML re-parse errors:\n' +
            reparsed.errors
              .map((e) => `  L${e.line}: ${e.message}`)
              .join('\n')
        );
      }
      expect(reparsed.model!.requirements).toHaveLength(
        csvResult.model!.requirements.length
      );

      // First-time generation: no on-disk file yet → write it out.
      // Subsequent runs: byte-compare against the committed artifact.
      // Set REGEN_FROM_CSV=1 to force a regenerate after editing the
      // CSV intentionally.
      if (REGEN || !existsSync(puml)) {
        writeFileSync(puml, generated, 'utf-8');
        return;
      }
      const onDisk = readFileSync(puml, 'utf-8');
      expect(generated).toBe(onDisk);
    });
  }
});
