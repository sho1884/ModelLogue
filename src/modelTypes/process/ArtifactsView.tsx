// Artifacts tab view (SR-123).

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ExportActions } from '../../components/ExportActions';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import {
  artifactsToCsv,
  artifactsToHtml,
  collectArtifacts,
} from './artifacts';
import type { ProcessModel } from './model';
import { EMPTY_CELL_DISPLAY } from '../../types/matrix';

function isProcessModel(m: unknown): m is ProcessModel {
  return !!(m && typeof m === 'object' && 'rootBody' in (m as object));
}

export function ArtifactsView() {
  const model = useModelStore((s) => s.model);
  const sessionName = useSessionStore((s) => s.sessionName);

  const rows = useMemo(
    () => (isProcessModel(model) ? collectArtifacts(model) : []),
    [model]
  );

  if (!isProcessModel(model)) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center p-4">
        Artifacts 一覧はプロセス図セッションで表示されます
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center p-4">
        <div>
          矢印ラベル（伝票）はフロー中の `-&gt; 伝票名;` で登場します。
          <div className="text-xs mt-2 text-gray-500">
            例: <code className="font-mono">:申込を受付; -&gt; 申込書; :審査;</code>
          </div>
        </div>
      </div>
    );
  }

  const handleCopy = () =>
    copyHtmlAndText(artifactsToHtml(rows), artifactsToCsv(rows));
  const handleSave = () =>
    downloadTextFile(
      sessionFilename(sessionName, 'artifacts', 'csv'),
      artifactsToCsv(rows),
      'text/csv'
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">{rows.length} 伝票（artifact）</span>
        <ExportActions
          onCopy={handleCopy}
          onSave={handleSave}
          saveLabel="Save .csv"
          disabled={rows.length === 0}
        />
      </div>
      <div className="overflow-auto flex-1 p-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {['artifact', 'producers', 'consumers'].map((h) => (
                <th
                  key={h}
                  className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap align-top"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="align-top">
                <td className="border border-gray-300 px-2 py-1 font-mono text-gray-800">
                  {r.name}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-700">
                  {r.producers.length === 0 ? (
                    <span className="text-gray-400">{EMPTY_CELL_DISPLAY}</span>
                  ) : (
                    r.producers.join('; ')
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-700">
                  {r.consumers.length === 0 ? (
                    <span className="text-gray-400">{EMPTY_CELL_DISPLAY}</span>
                  ) : (
                    r.consumers.join('; ')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
