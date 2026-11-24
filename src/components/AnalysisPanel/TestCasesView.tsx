// SR-103: Display N-switch Tests (verification patterns — primary) and
// Scenarios (executable walks that cover them — secondary), fed by the
// modellogue-nswitch HTTP API. Output is columnar (§6): one column per
// (event, guard, action, reached) step, for machine processing. SR-102: Copy /
// Save with a Tests|Scenarios toggle that switches both the on-screen table and
// the export target. Reactive to the current source; errors surface in-place.
// Guards are shown, never evaluated (nswitch §7.4.1, ADR-019): a Scenario that
// passes through a guarded step states the guard it assumes, and that guard
// cell is highlighted.

import type { ReactNode } from 'react';
import { useTestCasesStore } from '../../stores/testCasesStore';
import { useSessionStore } from '../../stores/sessionStore';
import type { CoverageMode, Precondition, Scenario, Step, Test } from '../../types/testCase';
import { ExportActions } from '../ExportActions';
import {
  scenariosToCsv,
  scenariosToHtml,
  testCasesToCsv,
  testCasesToHtml,
} from '../../engines/testCasesSerializer';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';

// Coverage selector (SR-103): positive N-switch levels + the negative
// "Invalid" mode (invalid-transition Tests, nswitch §7.2).
const MODE_OPTIONS: { id: CoverageMode; label: string }[] = [
  { id: 0, label: '0-switch' },
  { id: 1, label: '1-switch' },
  { id: 2, label: '2-switch' },
  { id: 'invalid', label: 'Invalid' },
];
const VIEWS: { id: 'tests' | 'scenarios'; label: string }[] = [
  { id: 'tests', label: 'Tests' },
  { id: 'scenarios', label: 'Scenarios' },
];

function maxSteps(items: { steps: Step[] }[]): number {
  return items.reduce((m, x) => Math.max(m, x.steps.length), 0);
}

function allInv(tests: Test[]): boolean {
  return tests.length > 0 && tests.every((t) => t.type === 'INV');
}

export function TestCasesView() {
  const mode = useTestCasesStore((s) => s.mode);
  const setMode = useTestCasesStore((s) => s.setMode);
  const view = useTestCasesStore((s) => s.view);
  const setView = useTestCasesStore((s) => s.setView);
  const status = useTestCasesStore((s) => s.status);
  const result = useTestCasesStore((s) => s.result);
  const error = useTestCasesStore((s) => s.error);
  const sessionName = useSessionStore((s) => s.sessionName);

  const isStale = status === 'loading' || status === 'error';
  const rows = result
    ? view === 'tests'
      ? result.tests.length
      : result.scenarios.length
    : 0;
  const hasData = rows > 0;

  const exportCsv = () => {
    if (!result) return '';
    return view === 'tests'
      ? testCasesToCsv(result.tests)
      : scenariosToCsv(result.scenarios);
  };
  const exportHtml = () => {
    if (!result) return '';
    return view === 'tests'
      ? testCasesToHtml(result.tests)
      : scenariosToHtml(result.scenarios);
  };
  const modeTag = mode === 'invalid' ? 'invalid' : `n${mode}`;
  const exportSuffix = view === 'tests' ? `tests-${modeTag}` : `scenarios-${modeTag}`;

  const scopeCount = result?.scopes.length ?? 0;
  const countLabel =
    status === 'loading'
      ? 'Generating…'
      : status === 'success' && result
        ? view === 'tests'
          ? `${rows} test${rows === 1 ? '' : 's'} across ${scopeCount} scope${scopeCount === 1 ? '' : 's'}`
          : `${rows} scenario${rows === 1 ? '' : 's'} across ${scopeCount} scope${scopeCount === 1 ? '' : 's'}`
        : status === 'idle'
          ? 'No model yet'
          : '';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-600">Coverage:</span>
        <div role="radiogroup" aria-label="Coverage mode" className="flex gap-1">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={String(opt.id)}
              type="button"
              role="radio"
              aria-checked={mode === opt.id}
              onClick={() => setMode(opt.id)}
              title={
                opt.id === 'invalid'
                  ? 'Invalid transitions: one negative Test per empty state-table cell (forbidden transition). nswitch §7.2.'
                  : `N-switch level ${opt.id}`
              }
              className={`px-2 py-0.5 text-xs border rounded ${
                mode === opt.id
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {mode !== 'invalid' && (
          <>
        <span className="text-xs text-gray-400">View:</span>
        <div role="radiogroup" aria-label="Test cases view" className="flex gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              title={
                v.id === 'tests'
                  ? 'Tests: the verification patterns to check (primary).'
                  : 'Scenarios: executable walks that cover the positive Tests (secondary).'
              }
              className={`px-2 py-0.5 text-xs border rounded ${
                view === v.id
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
          </>
        )}
        <span className="text-xs text-gray-700 font-semibold">{countLabel}</span>
        <div className="ml-auto">
          <ExportActions
            onCopy={() => {
              if (!hasData) return Promise.resolve();
              return copyHtmlAndText(exportHtml(), exportCsv());
            }}
            onSave={() => {
              if (!hasData) return;
              downloadTextFile(
                sessionFilename(sessionName, exportSuffix, 'csv'),
                exportCsv(),
                'text/csv'
              );
            }}
            copyTitle={
              view === 'tests'
                ? 'Copy Tests. HTML payload for Excel / Sheets / Word; plain-text payload is the columnar CSV defined in tools/nswitch §6.1.'
                : 'Copy Scenarios. HTML payload for Excel / Sheets / Word; plain-text payload is the columnar CSV defined in tools/nswitch §6.2.'
            }
            saveLabel="Save .csv"
            saveTitle={
              view === 'tests'
                ? 'Download the Tests CSV (§6.1). Filename encodes the current N-switch level.'
                : 'Download the Scenarios CSV (§6.2). Filename encodes the current N-switch level.'
            }
            disabled={!hasData}
          />
        </div>
      </div>

      {/* Inline hint banners */}
      {error && <ErrorBanner error={error} />}
      {result && result.uncovered.length > 0 && (
        <UncoveredBanner uncovered={result.uncovered} />
      )}
      {result && view === 'scenarios' && hasData && (
        <PreconditionsBanner scenarios={result.scenarios} />
      )}

      {/* Table body: tests or scenarios */}
      <div
        className={`overflow-auto flex-1 p-2 ${isStale ? 'opacity-60' : ''}`}
        aria-busy={status === 'loading'}
      >
        {hasData ? (
          view === 'tests' ? (
            <TestsTable tests={result!.tests} />
          ) : (
            <ScenariosTable scenarios={result!.scenarios} />
          )
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            {status === 'idle'
              ? 'The list appears once the model has at least one state.'
              : status === 'loading'
                ? 'Generating…'
                : view === 'tests'
                  ? 'No Tests yet.'
                  : 'No Scenarios yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

const TH =
  'border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap';
const TD = 'border border-gray-300 px-2 py-1 whitespace-nowrap';

// Columnar header cells: #, id, start, (event_i, guard_i, action_i, reached_i)…, tail.
function stepHeaders(k: number, ...tail: string[]): string[] {
  const h = ['#', 'id', 'start'];
  for (let i = 1; i <= k; i++) h.push(`event_${i}`, `guard_${i}`, `action_${i}`, `reached_${i}`);
  h.push(...tail);
  return h;
}

// `assumed` holds the 1-based step numbers whose guard the row assumes to hold
// (Scenario preconditions); those guard cells are highlighted.
function StepCells({
  steps,
  k,
  assumed,
}: {
  steps: Step[];
  k: number;
  assumed?: ReadonlySet<number>;
}) {
  const cells: ReactNode[] = [];
  for (let i = 0; i < k; i++) {
    const s = steps[i];
    const guard = s?.guard ?? '';
    const isAssumed = guard !== '' && (assumed?.has(i + 1) ?? false);
    cells.push(
      <td key={`e${i}`} className={`${TD} font-mono text-gray-800`}>
        {s ? s.event : ''}
      </td>,
      <td
        key={`g${i}`}
        className={`${TD} font-mono ${isAssumed ? 'bg-amber-100 text-amber-900 font-semibold' : 'text-gray-700'}`}
        title={isAssumed ? `Precondition: this guard must hold at step ${i + 1}` : undefined}
      >
        {guard ? `[${guard}]` : ''}
      </td>,
      <td key={`a${i}`} className={`${TD} text-gray-700`}>
        {s?.action ?? ''}
      </td>,
      <td key={`r${i}`} className={`${TD} font-mono text-gray-800`}>
        {s ? s.reached : ''}
      </td>
    );
  }
  return <>{cells}</>;
}

// "Precondition: step 4 [guard] holds" — one line per guarded step.
function PreconditionsCell({ pre }: { pre: Precondition[] | undefined }) {
  const list = pre ?? [];
  return (
    <td className={`${TD} text-amber-900`}>
      {list.map((p) => (
        <div key={p.step}>
          Precondition: step {p.step} <span className="font-mono">[{p.guard}]</span> holds
        </div>
      ))}
    </td>
  );
}

function TestsTable({ tests }: { tests: Test[] }) {
  if (allInv(tests)) return <InvTestsTable tests={tests} />;
  const k = maxSteps(tests);
  const headers = stepHeaders(k, 'scenarios');
  return (
    <table className="text-xs border-collapse">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tests.map((t, i) => (
          <tr key={t.id}>
            <td className={`${TD} text-right text-gray-500`}>{i + 1}</td>
            <td className={`${TD} font-mono text-gray-800`}>{t.id}</td>
            <td className={`${TD} font-mono text-gray-800`}>{t.start}</td>
            <StepCells steps={t.steps} k={k} />
            <td className={`${TD} font-mono text-emerald-700`}>
              {t.scenarios.join('; ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Negative (INV) Tests are a pure pattern (§6.1): in `start`, the forbidden
// `event` must cause no transition. No path is carried — how to reach the
// state is a runner procedure, not part of the test condition.
function InvTestsTable({ tests }: { tests: Test[] }) {
  const headers = ['#', 'id', 'start', 'event', 'expect'];
  return (
    <table className="text-xs border-collapse">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tests.map((t, i) => (
          <tr key={t.id} className="bg-red-50">
            <td className={`${TD} text-right text-gray-500`}>{i + 1}</td>
            <td className={`${TD} font-mono text-gray-800`}>{t.id}</td>
            <td className={`${TD} font-mono text-gray-800`}>{t.start}</td>
            <td className={`${TD} font-mono text-red-700`}>{t.event}</td>
            <td className={`${TD} text-red-700`}>{t.expect}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScenariosTable({ scenarios }: { scenarios: Scenario[] }) {
  const k = maxSteps(scenarios);
  const headers = stepHeaders(k, 'covers', 'preconditions');
  return (
    <table className="text-xs border-collapse">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className={TH}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scenarios.map((s, i) => (
          <tr key={s.id}>
            <td className={`${TD} text-right text-gray-500`}>{i + 1}</td>
            <td className={`${TD} font-mono text-gray-800`}>{s.id}</td>
            <td className={`${TD} font-mono text-gray-800`}>{s.start}</td>
            <StepCells
              steps={s.steps}
              k={k}
              assumed={new Set((s.preconditions ?? []).map((p) => p.step))}
            />
            <td className={`${TD} font-mono text-emerald-700`}>
              {s.covers.join('; ')}
            </td>
            <PreconditionsCell pre={s.preconditions} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Shown above the Scenarios table when any walk passes through a guarded step.
// The generator does not evaluate guards (nswitch §7.4.1, ADR-019), so the
// tester has to make each listed guard true — and a guard that depends on
// history may make a walk impossible.
function PreconditionsBanner({ scenarios }: { scenarios: Scenario[] }) {
  const n = scenarios.filter((s) => (s.preconditions ?? []).length > 0).length;
  if (n === 0) return null;
  return (
    <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 shrink-0">
      <strong className="font-semibold">
        {n} scenario{n === 1 ? '' : 's'} assume{n === 1 ? 's' : ''} guards hold.
      </strong>{' '}
      Guards are not evaluated: make each highlighted guard true at its step
      before running. If what happened earlier in the walk makes a guard
      impossible there, the scenario cannot be run as written — model that
      condition as a separate state instead of a guard.
    </div>
  );
}

function ErrorBanner({
  error,
}: {
  error: NonNullable<ReturnType<typeof useTestCasesStore.getState>['error']>;
}) {
  if (error.kind === 'network') {
    return (
      <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 shrink-0">
        <strong className="font-semibold">
          Test case service unreachable.
        </strong>{' '}
        Probed <code className="font-mono">{error.probedUrl}</code>. Is{' '}
        <code className="font-mono">nswitch-api</code> running? The rest of
        the app keeps working; the tab will retry on the next source change.
      </div>
    );
  }
  if (error.kind === 'parse_error') {
    return (
      <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 shrink-0">
        <strong className="font-semibold">
          The nswitch service rejected the source:
        </strong>{' '}
        {error.message}. The previous result, if any, is shown greyed below.
      </div>
    );
  }
  return (
    <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-900 shrink-0">
      <strong className="font-semibold">
        Test case service returned an error.
      </strong>{' '}
      {error.message} (type: {error.kind}
      {error.status ? `, HTTP ${error.status}` : ''}). See console for details.
    </div>
  );
}

function UncoveredBanner({
  uncovered,
}: {
  uncovered: NonNullable<
    ReturnType<typeof useTestCasesStore.getState>['result']
  >['uncovered'];
}) {
  return (
    <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-900 shrink-0">
      <strong className="font-semibold">
        {uncovered.length} chain
        {uncovered.length === 1 ? '' : 's'} left uncovered
      </strong>
      {' '}(unreachable from the initial state):
      <ul className="mt-1 space-y-0.5">
        {uncovered.slice(0, 5).map((u, i) => (
          <li key={i} className="font-mono">
            <span className="text-yellow-700">[{u.scope}]</span>{' '}
            {u.chain
              .map(
                (t, idx) =>
                  (idx === 0 ? t.source : '') +
                  ` --${t.event ?? '()'}--> ${t.target}`
              )
              .join('')}
          </li>
        ))}
        {uncovered.length > 5 && (
          <li className="text-yellow-700">
            … and {uncovered.length - 5} more
          </li>
        )}
      </ul>
    </div>
  );
}
