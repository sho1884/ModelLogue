// SR-103 / ADR-019: the Test cases tab shows each step's guard and action, and a
// Scenario that passes through a guarded step states the guard it assumes (with
// the guard cell highlighted). Rendered statically from the golden library-loan
// result written by tools/nswitch (tests/golden/nswitch-library).

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TestCasesView } from '../../src/components/AnalysisPanel/TestCasesView';
import { useTestCasesStore } from '../../src/stores/testCasesStore';
import type { NswitchGenerationResult } from '../../src/types/testCase';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const result = JSON.parse(
  readFileSync(resolve(__dirname, '../golden/nswitch-library/n0.result.json'), 'utf-8')
) as NswitchGenerationResult;

let root: Root | null = null;

function render(view: 'tests' | 'scenarios', r: NswitchGenerationResult = result): string {
  useTestCasesStore.setState({ mode: 0, view, status: 'success', result: r, error: null });
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(<TestCasesView />);
  });
  return host.innerHTML;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  useTestCasesStore.getState().reset();
});

describe('Test cases tab: guards and actions (ADR-019)', () => {
  it('Tests view has guard / action columns per step and no precondition banner', () => {
    const html = render('tests');
    expect(html).toContain('>guard_1</th>');
    expect(html).toContain('>action_1</th>');
    expect(html).toContain('[期限経過済]');
    expect(html).toContain('延滞を記録する');
    expect(html).not.toContain('assume');
  });

  it('Scenarios view states each precondition and highlights the guard cell', () => {
    const html = render('scenarios');
    expect(html).toContain('3 scenarios assume guards hold.');
    expect(html).toContain('>preconditions</th>');
    // lib-SC-002 assumes two guards, in step order.
    expect(html).toMatch(/Precondition: step 2 <span[^>]*>\[期限内\]<\/span> holds.*Precondition: step 4 <span[^>]*>\[期限経過済\]<\/span> holds/);
    const highlighted = html.match(/<td[^>]*bg-amber-100[^>]*>\[[^\]]+\]<\/td>/g) ?? [];
    // 1 + 2 + 1 guarded steps across the three scenarios.
    expect(highlighted).toHaveLength(4);
  });

  it('a model without guards shows no banner, no precondition and no highlight', () => {
    const unguarded: NswitchGenerationResult = {
      ...result,
      scenarios: result.scenarios.map((s) => ({
        ...s,
        steps: s.steps.map((st) => ({ ...st, guard: '' })),
        preconditions: [],
      })),
    };
    const html = render('scenarios', unguarded);
    expect(html).not.toContain('assume');
    expect(html).not.toContain('Precondition:');
    expect(html).not.toContain('bg-amber-100');
  });
});
