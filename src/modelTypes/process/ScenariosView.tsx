// Scenarios tab view (SR-120).
// Enumerated start→end paths as a table, one row per path. Copy / Save .csv.

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ExportActions } from '../../components/ExportActions';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import { enumeratePaths, pathsToCsv, pathsToHtml } from './paths';
import type { ProcessModel } from './model';

function isProcessModel(m: unknown): m is ProcessModel {
  return !!(m && typeof m === 'object' && 'rootBody' in (m as object));
}

export function ScenariosView() {
  const model = useModelStore((s) => s.model);
  const sessionName = useSessionStore((s) => s.sessionName);

  const rows = useMemo(() => {
    if (!isProcessModel(model)) return [];
    return enumeratePaths(model);
  }, [model]);

  if (!isProcessModel(model) || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Scenarios は `start` → `stop` の経路がひとつ以上ある時に表示されます。
      </div>
    );
  }

  const handleCopy = () => copyHtmlAndText(pathsToHtml(rows), pathsToCsv(rows));
  const handleSave = () =>
    downloadTextFile(
      sessionFilename(sessionName, 'scenarios', 'csv'),
      pathsToCsv(rows),
      'text/csv'
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">
          {rows.length} scenario path{rows.length === 1 ? '' : 's'} — 各行 = 1 テストケース候補
        </span>
        <ExportActions
          onCopy={handleCopy}
          onSave={handleSave}
          copyTitle="Copy scenarios. HTML + CSV payload."
          saveLabel="Save .csv"
          saveTitle="SR-120 の canonical CSV を出力"
          disabled={rows.length === 0}
        />
      </div>
      <div className="overflow-auto flex-1 p-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {[
                'path_id',
                'steps',
                'branches_taken',
                'lanes',
                'events',
                'artifacts',
                'externals_touched',
              ].map((h) => (
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
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="border border-gray-300 px-2 py-1 font-mono whitespace-nowrap align-top">
                  {r.id}
                </td>
                <td className="border border-gray-300 px-2 py-1 align-top">
                  {r.steps.join(' → ')}
                </td>
                <td className="border border-gray-300 px-2 py-1 align-top text-gray-700">
                  {r.branches.join('; ')}
                </td>
                <td className="border border-gray-300 px-2 py-1 align-top text-gray-600">
                  {r.lanes.join(' → ')}
                </td>
                <td className="border border-gray-300 px-2 py-1 align-top text-gray-600">
                  {r.events.join(', ')}
                </td>
                <td className="border border-gray-300 px-2 py-1 align-top text-gray-600 font-mono">
                  {r.artifacts.join(', ')}
                </td>
                <td className="border border-gray-300 px-2 py-1 align-top text-gray-600">
                  {r.externals.join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
