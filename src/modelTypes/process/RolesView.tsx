// Roles tab view (SR-122).

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ExportActions } from '../../components/ExportActions';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import { collectRoles, rolesToCsv, rolesToHtml } from './roles';
import type { ProcessModel } from './model';
import { EMPTY_CELL_DISPLAY } from '../../types/matrix';

function isProcessModel(m: unknown): m is ProcessModel {
  return !!(m && typeof m === 'object' && 'rootBody' in (m as object));
}

export function RolesView() {
  const model = useModelStore((s) => s.model);
  const sessionName = useSessionStore((s) => s.sessionName);

  const rows = useMemo(
    () => (isProcessModel(model) ? collectRoles(model) : []),
    [model]
  );

  if (!isProcessModel(model) || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 text-center p-4">
        Roles 一覧はタスクが 1 件以上ある時に表示されます
      </div>
    );
  }

  const handleCopy = () =>
    copyHtmlAndText(rolesToHtml(rows), rolesToCsv(rows));
  const handleSave = () =>
    downloadTextFile(
      sessionFilename(sessionName, 'roles', 'csv'),
      rolesToCsv(rows),
      'text/csv'
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">
          {rows.length} lane{rows.length === 1 ? '' : 's'} — 引渡点が UAT の担当割当の基礎
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
              {['lane', 'tasks', 'outgoing hand-offs', 'incoming hand-offs'].map((h) => (
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
              <tr key={r.lane} className="align-top">
                <td className="border border-gray-300 px-2 py-1 font-medium text-gray-800 whitespace-nowrap">
                  {r.lane}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-700">
                  {r.tasks.join('; ')}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-600">
                  {r.outgoingHandOffs.length === 0 ? (
                    <span className="text-gray-400">{EMPTY_CELL_DISPLAY}</span>
                  ) : (
                    <ul className="list-disc pl-4">
                      {r.outgoingHandOffs.map((h, i) => (
                        <li key={i}>
                          {h.fromTask} → <span className="italic">{h.toLane}</span>:{' '}
                          {h.toTask}
                          {h.artifact ? (
                            <span className="ml-1 font-mono text-gray-500">
                              [{h.artifact}]
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-gray-600">
                  {r.incomingHandOffs.length === 0 ? (
                    <span className="text-gray-400">{EMPTY_CELL_DISPLAY}</span>
                  ) : (
                    <ul className="list-disc pl-4">
                      {r.incomingHandOffs.map((h, i) => (
                        <li key={i}>
                          <span className="italic">{h.fromLane}</span>:{' '}
                          {h.fromTask} → {h.toTask}
                          {h.artifact ? (
                            <span className="ml-1 font-mono text-gray-500">
                              [{h.artifact}]
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
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
