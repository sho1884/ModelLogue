// SR-112: Orphan requirements view.
// Lists requirements with no incoming and/or no outgoing
// requirement-to-requirement relation (ADR-013).

import { useMemo } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { findOrphans } from './orphans';
import type { Requirement, RequirementModel } from './model';

function isRequirementModel(m: unknown): m is RequirementModel {
  return !!(m && typeof m === 'object' && 'requirements' in (m as object));
}

function Row({ r }: { r: Requirement }) {
  return (
    <li className="flex items-baseline gap-2 py-0.5">
      <span className="font-mono text-gray-700">{r.id}</span>
      <span className="text-gray-500">{r.name}</span>
      <span className="text-xs text-gray-400">({r.type})</span>
    </li>
  );
}

export function OrphansView() {
  const model = useModelStore((s) => s.model);

  const report = useMemo(() => {
    if (!isRequirementModel(model)) return null;
    return findOrphans(model);
  }, [model]);

  if (!report) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        The orphan report appears once the model has at least one
        requirement.
      </div>
    );
  }

  const { noIncoming, noOutgoing, isolated } = report;

  return (
    <div className="flex flex-col h-full overflow-auto p-3 text-sm">
      <p className="text-xs text-gray-500 mb-3">
        Orphan analysis considers derive / contain / refine / copy only
        (ADR-013). Hidden and deleted requirements are excluded.
      </p>

      <Section
        title="No incoming trace"
        hint="Likely top-level, or missing a derive/contain from a higher requirement."
        rows={noIncoming}
      />
      <Section
        title="No outgoing trace"
        hint="Likely an un-decomposed leaf; may need breakdown into derived or contained requirements."
        rows={noOutgoing}
      />
      <Section
        title="Isolated (both in and out empty)"
        hint="Disconnected from the rest of the model."
        rows={isolated}
        emphasize
      />
    </div>
  );
}

function Section({
  title,
  hint,
  rows,
  emphasize = false,
}: {
  title: string;
  hint: string;
  rows: Requirement[];
  emphasize?: boolean;
}) {
  return (
    <div className="mb-4">
      <div
        className={`font-medium text-sm ${
          emphasize ? 'text-amber-700' : 'text-gray-700'
        }`}
      >
        {title}{' '}
        <span className="text-gray-400 text-xs">({rows.length})</span>
      </div>
      <div className="text-xs text-gray-500 mb-1">{hint}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-gray-400">— none —</div>
      ) : (
        <ul className="ml-2">
          {rows.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
