// SR-103: Display N-switch test cases fed by the modellogue-nswitch
// HTTP API. SR-102: Copy / Save with a Tests|Coverage view toggle that
// switches both the on-screen table and the export target. Reactive to
// the current source; errors surface in-place.

import { useTestCasesStore } from '../../stores/testCasesStore';
import { getBaseUrl } from '../../services/nswitchService';
import { useSessionStore } from '../../stores/sessionStore';
import type { NSwitchLevel } from '../../types/testCase';
import { ExportActions } from '../ExportActions';
import {
  coverageToCsv,
  coverageToHtml,
  testCasesToCsv,
  testCasesToHtml,
} from '../../engines/testCasesSerializer';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';

const N_OPTIONS: NSwitchLevel[] = [0, 1, 2];
const VIEWS: { id: 'tests' | 'coverage'; label: string }[] = [
  { id: 'tests', label: 'Tests' },
  { id: 'coverage', label: 'Coverage' },
];

export function TestCasesView() {
  const n = useTestCasesStore((s) => s.n);
  const setN = useTestCasesStore((s) => s.setN);
  const view = useTestCasesStore((s) => s.view);
  const setView = useTestCasesStore((s) => s.setView);
  const status = useTestCasesStore((s) => s.status);
  const result = useTestCasesStore((s) => s.result);
  const error = useTestCasesStore((s) => s.error);
  const sessionName = useSessionStore((s) => s.sessionName);

  const isStale = status === 'loading' || status === 'error';
  const hasTests = !!(result && result.tests.length > 0);

  const exportCsv = () => {
    if (!result) return '';
    return view === 'tests'
      ? testCasesToCsv(result.tests)
      : coverageToCsv(result.coverage, result.tests);
  };
  const exportHtml = () => {
    if (!result) return '';
    return view === 'tests'
      ? testCasesToHtml(result.tests)
      : coverageToHtml(result.coverage, result.tests);
  };
  const exportSuffix = view === 'tests' ? `testcases-n${n}` : `coverage-n${n}`;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-600">N-switch:</span>
        <div role="radiogroup" aria-label="N-switch level" className="flex gap-1">
          {N_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={n === opt}
              onClick={() => setN(opt)}
              className={`px-2 py-0.5 text-xs border rounded ${
                n === opt
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              N={opt}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">View:</span>
        <div role="radiogroup" aria-label="Test cases view" className="flex gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              className={`px-2 py-0.5 text-xs border rounded ${
                view === v.id
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">
          {status === 'loading' && 'Generating…'}
          {status === 'success' && result &&
            (view === 'tests'
              ? `${result.tests.length} test${result.tests.length === 1 ? '' : 's'} across ${result.layers.length} layer${result.layers.length === 1 ? '' : 's'}`
              : `${result.coverage.length} required chain${result.coverage.length === 1 ? '' : 's'}`)}
          {status === 'idle' && 'No model yet'}
        </span>
        <div className="ml-auto">
          <ExportActions
            onCopy={() => {
              if (!hasTests) return Promise.resolve();
              return copyHtmlAndText(exportHtml(), exportCsv());
            }}
            onSave={() => {
              if (!hasTests) return;
              downloadTextFile(
                sessionFilename(sessionName, exportSuffix, 'csv'),
                exportCsv(),
                'text/csv'
              );
            }}
            copyTitle={
              view === 'tests'
                ? 'Copy test cases. HTML payload for Excel / Sheets / Word; plain-text payload is the CSV defined in tools/nswitch §6.1.'
                : 'Copy coverage report. HTML payload for Excel / Sheets / Word; plain-text payload is the CSV defined in tools/nswitch §6.2.'
            }
            saveLabel="Save .csv"
            saveTitle={
              view === 'tests'
                ? 'Download the test-case CSV (§6.1). Filename encodes the current N-switch level.'
                : 'Download the coverage-report CSV (§6.2). Filename encodes the current N-switch level.'
            }
            disabled={!hasTests}
          />
        </div>
      </div>

      {/* Inline hint banners */}
      {error && <ErrorBanner error={error} />}
      {result && result.uncovered.length > 0 && (
        <UncoveredBanner uncovered={result.uncovered} />
      )}

      {/* Table body: tests or coverage */}
      <div
        className={`overflow-auto flex-1 p-2 ${isStale ? 'opacity-60' : ''}`}
        aria-busy={status === 'loading'}
      >
        {hasTests ? (
          view === 'tests' ? (
            <TestsTable result={result!} />
          ) : (
            <CoverageTable result={result!} />
          )
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            {status === 'idle'
              ? 'The test case list appears once the model has at least one state.'
              : status === 'loading'
                ? 'Generating test cases…'
                : 'No test cases yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

function TestsTable({
  result,
}: {
  result: NonNullable<ReturnType<typeof useTestCasesStore.getState>['result']>;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          {['test_id', 'layer', 'length', 'start', 'sequence', 'end'].map(
            (h) => (
              <th
                key={h}
                className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600"
              >
                {h}
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {result.tests.map((t) => (
          <tr key={t.test_id} title={t.covers}>
            <td className="border border-gray-300 px-2 py-1 font-mono text-gray-800 whitespace-nowrap">
              {t.test_id}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-gray-700 whitespace-nowrap">
              {t.layer}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-right text-gray-700">
              {t.length}
            </td>
            <td className="border border-gray-300 px-2 py-1 font-mono text-gray-800 whitespace-nowrap">
              {t.start}
            </td>
            <td className="border border-gray-300 px-2 py-1 font-mono text-gray-800">
              {t.sequence}
            </td>
            <td className="border border-gray-300 px-2 py-1 font-mono text-gray-800 whitespace-nowrap">
              {t.end}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CoverageTable({
  result,
}: {
  result: NonNullable<ReturnType<typeof useTestCasesStore.getState>['result']>;
}) {
  const tests = result.tests;
  return (
    <table className="text-xs border-collapse">
      <thead>
        <tr>
          {['kind', 'layer', 'element'].map((h) => (
            <th
              key={h}
              className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap"
            >
              {h}
            </th>
          ))}
          {tests.map((t) => (
            <th
              key={t.test_id}
              className="border border-gray-300 bg-gray-100 px-2 py-1 text-center font-medium text-gray-600 whitespace-nowrap"
              title={t.covers}
            >
              {t.test_id}
            </th>
          ))}
          {['status', 'reason'].map((h) => (
            <th
              key={h}
              className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.coverage.map((row, i) => (
          <tr key={`${row.layer}-${row.element}-${i}`}>
            <td className="border border-gray-300 px-2 py-1 text-gray-700 whitespace-nowrap">
              {row.kind}
            </td>
            <td className="border border-gray-300 px-2 py-1 text-gray-700 whitespace-nowrap">
              {row.layer}
            </td>
            <td className="border border-gray-300 px-2 py-1 font-mono text-gray-800 whitespace-nowrap">
              {row.element}
            </td>
            {tests.map((t) => {
              const marker = row.hits[t.test_id] ?? '';
              const cellClass = marker === '#'
                ? 'bg-indigo-100 text-indigo-800 font-semibold'
                : marker === 'x'
                  ? 'bg-gray-100 text-gray-500'
                  : 'text-gray-300';
              return (
                <td
                  key={t.test_id}
                  className={`border border-gray-300 px-2 py-1 text-center ${cellClass}`}
                >
                  {marker}
                </td>
              );
            })}
            <td
              className={`border border-gray-300 px-2 py-1 whitespace-nowrap ${
                row.status ? 'text-amber-700' : 'text-gray-400'
              }`}
            >
              {row.status}
            </td>
            <td
              className={`border border-gray-300 px-2 py-1 ${
                row.reason ? 'text-amber-700' : 'text-gray-400'
              }`}
            >
              {row.reason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const base = getBaseUrl();
  void base;
  return (
    <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-900 shrink-0">
      <strong className="font-semibold">
        {uncovered.length} chain
        {uncovered.length === 1 ? '' : 's'} left uncovered
      </strong>
      {' '}(increase <code className="font-mono">max_cycle_unroll</code> or
      reduce N):
      <ul className="mt-1 space-y-0.5">
        {uncovered.slice(0, 5).map((u, i) => (
          <li key={i} className="font-mono">
            <span className="text-yellow-700">[{u.layer}]</span>{' '}
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
