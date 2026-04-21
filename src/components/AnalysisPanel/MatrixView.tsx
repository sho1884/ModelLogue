import type { MatrixData } from '../../types/matrix';
import { ExportActions } from '../ExportActions';
import {
  matrixToCsv,
  matrixToHtml,
} from '../../engines/matrixSerializer';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import { useSessionStore } from '../../stores/sessionStore';

interface MatrixViewProps {
  matrix: MatrixData | null;
  title: string;
  /** Filename suffix for exports (e.g. "state-event" → modellogue-<name>-state-event-...csv) */
  exportSuffix: string;
}

// Pixels of left padding per indentation level (hybrid pattern).
const INDENT_PX = 18;

export function MatrixView({ matrix, title, exportSuffix }: MatrixViewProps) {
  const sessionName = useSessionStore((s) => s.sessionName);

  if (!matrix || matrix.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        No data yet. The matrix appears once the model has at least one state.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-end shrink-0">
        <ExportActions
          onCopy={() => {
            const csv = matrixToCsv(matrix, title);
            return copyHtmlAndText(matrixToHtml(matrix, title), csv);
          }}
          onSave={() =>
            downloadTextFile(
              sessionFilename(sessionName, exportSuffix, 'csv'),
              matrixToCsv(matrix, title),
              'text/csv'
            )
          }
          copyTitle="Copy as a table (HTML for Excel / Sheets / Word; CSV as plain text for repos, AI prompts, test-generation tools)"
          saveLabel="Save .csv"
          saveTitle="Download as a CSV file (RFC 4180)"
        />
      </div>
      <div className="overflow-auto flex-1 p-2">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600">
              {title}
            </th>
            {matrix.columnHeaders.map((col, ci) => {
              // For PreState×PostState matrix, column headers mirror rows and
              // we want the same hybrid indentation + composite emphasis.
              // We detect this by checking whether a row with the same label exists.
              const matchingRow = matrix.rows.find((r) => r.label === col);
              const indent = matchingRow ? matchingRow.level * INDENT_PX : 0;
              const isComposite = matchingRow?.isComposite ?? false;
              return (
                <th
                  key={`${col}-${ci}`}
                  className={`border border-gray-300 px-2 py-1 text-center font-medium ${
                    isComposite
                      ? 'bg-gray-200 text-gray-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  style={{ paddingLeft: indent + 8 }}
                >
                  {col}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, ri) => {
            const rowHeaderClass = row.isComposite
              ? 'border border-gray-300 px-2 py-1 font-semibold text-gray-800 bg-gray-200'
              : 'border border-gray-300 px-2 py-1 font-medium text-gray-700 bg-gray-50';
            return (
              <tr key={`${row.stateId}-${ri}`}>
                <td
                  className={rowHeaderClass}
                  style={{ paddingLeft: row.level * INDENT_PX + 8 }}
                >
                  {row.label}
                </td>
                {matrix.cells[ri].map((cell, ci) => (
                  <td
                    key={ci}
                    className={`border border-gray-300 px-2 py-1 text-center ${
                      cell ? 'text-gray-800' : 'text-gray-300'
                    } ${row.isComposite ? 'bg-gray-50' : ''}`}
                  >
                    {cell ?? ''}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
