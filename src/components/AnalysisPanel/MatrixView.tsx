import type { MatrixData } from '../../types/matrix';

interface MatrixViewProps {
  matrix: MatrixData | null;
  title: string;
}

export function MatrixView({ matrix, title }: MatrixViewProps) {
  if (!matrix || matrix.rowHeaders.length === 0) {
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
            {matrix.columnHeaders.map((col) => (
              <th
                key={col}
                className="border border-gray-300 bg-gray-100 px-2 py-1 text-center font-medium text-gray-600"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rowHeaders.map((row, ri) => (
            <tr key={row}>
              <td className="border border-gray-300 px-2 py-1 font-medium text-gray-700 bg-gray-50">
                {row}
              </td>
              {matrix.cells[ri].map((cell, ci) => (
                <td
                  key={ci}
                  className={`border border-gray-300 px-2 py-1 text-center ${
                    cell ? 'text-gray-800' : 'text-gray-300'
                  }`}
                >
                  {cell ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
