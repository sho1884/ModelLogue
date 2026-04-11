import type { MatrixData } from '../../types/matrix';

interface MatrixViewProps {
  matrix: MatrixData | null;
  title: string;
}

// Pixels of left padding per indentation level (hybrid pattern).
const INDENT_PX = 18;

export function MatrixView({ matrix, title }: MatrixViewProps) {
  if (!matrix || matrix.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        No data — edit PlantUML source in Source tab
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full p-2">
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
  );
}
