// SR-111: Traceability matrix view for the requirement-diagram type.
// Rows and columns are requirement ids; cells show relation-kind
// abbreviations (D=derive, C=contain, R=refine, Cp=copy).

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { buildTraceabilityMatrix } from './traceability';
import type { RequirementModel } from './model';

function isRequirementModel(m: unknown): m is RequirementModel {
  return !!(m && typeof m === 'object' && 'requirements' in (m as object));
}

export function TraceabilityView() {
  const model = useModelStore((s) => s.model);

  const matrix = useMemo(() => {
    if (!isRequirementModel(model)) return null;
    return buildTraceabilityMatrix(model);
  }, [model]);

  if (!matrix || matrix.ids.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        The traceability matrix appears once the model has at least one
        requirement.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 shrink-0 text-xs text-gray-500">
        Traceability: D = derive · C = contain · R = refine · Cp = copy
        (ADR-013 scope; satisfy / verify / trace are not surfaced here).
      </div>
      <div className="overflow-auto flex-1 p-2">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap sticky top-0 left-0 z-10">
                from \ to
              </th>
              {matrix.ids.map((colId) => (
                <th
                  key={colId}
                  className="border border-gray-300 bg-gray-100 px-2 py-1 text-center font-medium text-gray-600 font-mono whitespace-nowrap sticky top-0"
                >
                  {colId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.ids.map((rowId) => (
              <tr key={rowId}>
                <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 font-mono whitespace-nowrap sticky left-0">
                  {rowId}
                </th>
                {matrix.ids.map((colId) => {
                  const ks = matrix.cells[rowId][colId];
                  if (ks.length === 0) {
                    return (
                      <td
                        key={colId}
                        className="border border-gray-300 px-2 py-1 text-gray-200 text-center"
                      >
                        ·
                      </td>
                    );
                  }
                  return (
                    <td
                      key={colId}
                      className="border border-gray-300 px-2 py-1 text-center font-semibold text-emerald-700 bg-emerald-50"
                      title={ks.join(', ')}
                    >
                      {ks.join(',')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
