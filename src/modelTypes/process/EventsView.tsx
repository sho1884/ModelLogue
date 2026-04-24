// Events tab view (SR-121).

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ExportActions } from '../../components/ExportActions';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import { collectEvents, eventsToCsv, eventsToHtml } from './events';
import type { ProcessModel } from './model';

function isProcessModel(m: unknown): m is ProcessModel {
  return !!(m && typeof m === 'object' && 'rootBody' in (m as object));
}

const KIND_LABEL: Record<'timer' | 'message' | 'error', string> = {
  timer: 'タイマー',
  message: 'メッセージ',
  error: 'エラー',
};

export function EventsView() {
  const model = useModelStore((s) => s.model);
  const sessionName = useSessionStore((s) => s.sessionName);

  const rows = useMemo(
    () => (isProcessModel(model) ? collectEvents(model) : []),
    [model]
  );

  if (!isProcessModel(model) || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center p-4">
        <div>
          イベント一覧は `:task;&lt;&lt;timer&gt;&gt;` / `&lt;&lt;message&gt;&gt;` / `&lt;&lt;error&gt;&gt;` の
          ステレオタイプが 1 件以上ある時に表示されます
        </div>
      </div>
    );
  }

  const handleCopy = () =>
    copyHtmlAndText(eventsToHtml(rows), eventsToCsv(rows));
  const handleSave = () =>
    downloadTextFile(
      sessionFilename(sessionName, 'events', 'csv'),
      eventsToCsv(rows),
      'text/csv'
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">
          {rows.length} event task{rows.length === 1 ? '' : 's'}
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
              {['task', 'lane', 'event', 'line', 'path_count'].map((h) => (
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
              <tr key={r.taskId}>
                <td className="border border-gray-300 px-2 py-1">{r.taskLabel}</td>
                <td className="border border-gray-300 px-2 py-1 text-gray-600">{r.lane}</td>
                <td className="border border-gray-300 px-2 py-1 text-gray-700 whitespace-nowrap">
                  {KIND_LABEL[r.kind]} ({r.kind})
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-500 text-right font-mono">
                  {r.line}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-700 text-right font-mono">
                  {r.pathCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
