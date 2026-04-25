// Sanity tests for the v7.6 process-type debug scenarios.
// Catches authoring errors (a step's mock reply has an unparseable
// PlantUML block) before running the scenario in the UI.

import { describe, it, expect } from 'vitest';
import { SCENARIOS } from '../../src/debug/scenarios';
import { parse } from '../../src/modelTypes/process/parser';

function extractPlantUml(text: string): string | null {
  const m = text.match(/```plantuml\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

const processScenarios = SCENARIOS.filter(
  (s) => s.modelTypeId === 'process'
);

describe('process scenarios — mock replies parse', () => {
  it('registers both v7.6 scenarios', () => {
    const ids = processScenarios.map((s) => s.id);
    expect(ids).toContain('10-process-apply-basics');
    expect(ids).toContain('11-process-realistic-review');
  });

  it.each(processScenarios)(
    '%s: every mock reply parses',
    (scenario) => {
      scenario.steps.forEach((step, stepIdx) => {
        step.mockReplies.forEach((reply, replyIdx) => {
          const puml = extractPlantUml(reply.text);
          expect(
            puml,
            'step ' +
              (stepIdx + 1) +
              ' reply ' +
              (replyIdx + 1) +
              ' has no plantuml code block'
          ).not.toBeNull();
          const r = parse(puml!);
          if (r.errors.length > 0) {
            throw new Error(
              `${scenario.id} step ${stepIdx + 1} reply ${replyIdx + 1} failed to parse:\n` +
                r.errors
                  .map((e) => `  line ${e.line}: ${e.message}`)
                  .join('\n')
            );
          }
          expect(r.model).not.toBeNull();
        });
      });
    }
  );
});
