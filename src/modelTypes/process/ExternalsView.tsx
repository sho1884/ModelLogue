// Externals tab view (SR-125).

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ExportActions } from '../../components/ExportActions';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import {
  collectExternals,
  externalsToCsv,
  externalsToHtml,
} from './externals';
import type { ProcessModel } from './model';

function isProcessModel(m: unknown): m is ProcessModel {
  return !!(m && typeof m === 'object' && 'rootBody' in (m as object));
}

export function ExternalsView() {
  const model = useModelStore((s) => s.model);
  const sessionName = useSessionStore((s) => s.sessionName);

  const rows = useMemo(
    () => (isProcessModel(model) ? collectExternals(model) : []),
    [model]
  );

  if (!isProcessModel(model)) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center p-4">
        Externals はプロセス図セッションで表示されます
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center p-4">
        <div>
          外部 IT システム・リポジトリは note 内に `**外部:** 名前` と書くと登場します。
          <div className="text-xs mt-2 text-gray-500 font-mono text-left inline-block">
            :内容を審査;<br />
            note right<br />
            **外部:** 申込マスタDB<br />
            **外部:** 与信照会API<br />
            end note
          </div>
        </div>
      </div>
    );
  }

  const handleCopy = () =>
    copyHtmlAndText(externalsToHtml(rows), externalsToCsv(rows));
  const handleSave = () =>
    downloadTextFile(
      sessionFilename(sessionName, 'externals', 'csv'),
      externalsToCsv(rows),
      'text/csv'
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">
          {rows.length} 外部 IT 要素
        </span>
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
              {['external', 'touching tasks'].map((h) => (
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
                <td className="border border-gray-300 px-2 py-1 font-medium text-gray-800 whitespace-nowrap">
                  {r.name}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-700">
                  {r.touchingTasks.join('; ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
