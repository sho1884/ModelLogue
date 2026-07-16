import type { MatrixData } from '../../types/matrix';
import { EMPTY_CELL_DISPLAY, isEmptyCell } from '../../types/matrix';
import { ExportActions } from '../ExportActions';
import { matrixToHtml } from '../../engines/matrixSerializer';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import { useSessionStore } from '../../stores/sessionStore';

interface MatrixViewProps {
  matrix: MatrixData | null;
  title: string;
  /**
   * The plain-text / .csv export payload for THIS tab (SR-101: "export each
   * matrix from its tab"). Each tab passes its own, because the two matrices
   * are different artifacts: State×Event exports the canonical
   * state-transition-table CSV (round-trips with modellogue-nswitch), while
   * PreState×PostState — whose axes are both states — has no canonical form
   * and exports a faithful grid CSV of what is shown. Deriving one CSV from
   * the model for both tabs is exactly how they used to download identically.
   */
  exportCsv: string;
  /** Filename suffix, so the two tabs' downloads are also distinguishable. */
  exportSuffix: string;
  /** Tooltip describing what the .csv is, since it now differs per tab. */
  saveTitle: string;
}

// Pixels of left padding per indentation level (hybrid pattern).
const INDENT_PX = 18;

export function MatrixView({
  matrix,
  title,
  exportCsv,
  exportSuffix,
  saveTitle,
}: MatrixViewProps) {
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
          onCopy={() =>
            copyHtmlAndText(matrixToHtml(matrix, title), exportCsv)
          }
          onSave={() =>
            downloadTextFile(
              sessionFilename(sessionName, exportSuffix, 'csv'),
              exportCsv,
              'text/csv'
            )
          }
          copyTitle="Copy as a table. HTML payload is the matrix for Excel / Sheets / Word; plain-text payload is the CSV for repos, AI prompts, and tools."
          saveLabel="Save .csv"
          saveTitle={saveTitle}
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
                {matrix.cells[ri].map((cell, ci) => {
                  // SR-020: never leave an empty cell blank. A cell with no
                  // transition is an invalid/forbidden transition, shown as
                  // `-` — the negative-test target (UR-013, nswitch §7.2).
                  // The marker and the predicate are shared with the HTML
                  // clipboard payload (types/matrix), so the two human-facing
                  // renderings cannot drift apart again.
                  const empty = isEmptyCell(cell);
                  return (
                    <td
                      key={ci}
                      title={
                        empty
                          ? 'No transition — invalid/forbidden (negative-test target)'
                          : undefined
                      }
                      className={`border border-gray-300 px-2 py-1 text-center ${
                        empty ? 'text-gray-300' : 'text-gray-800'
                      } ${row.isComposite ? 'bg-gray-50' : ''}`}
                    >
                      {empty ? EMPTY_CELL_DISPLAY : cell}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
