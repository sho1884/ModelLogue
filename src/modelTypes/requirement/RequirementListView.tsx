// SR-113: Requirement list tab — table + Copy / Save .csv + visibility
// checkboxes + soft-delete action per ADR-014.

import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { ExportActions } from '../../components/ExportActions';
import { copyHtmlAndText } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';
import {
  modelToRequirementsCsv,
  modelToRequirementsHtml,
} from './listSerializer';
import type { Requirement, RequirementModel } from './model';

function isRequirementModel(m: unknown): m is RequirementModel {
  return !!(m && typeof m === 'object' && 'requirements' in (m as object));
}

const TYPE_LABEL: Record<Requirement['type'], string> = {
  requirement: 'req',
  functionalRequirement: 'functional',
  nonFunctionalRequirement: 'nonfunctional',
  designConstraint: 'constraint',
};

export function RequirementListView() {
  const model = useModelStore((s) => s.model);
  const sessionName = useSessionStore((s) => s.sessionName);

  if (!isRequirementModel(model) || model.requirements.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        No requirements yet. Paste a list into the Requirements tab and
        press Generate model, or type macro calls into the Source tab.
      </div>
    );
  }

  const hasAny = model.requirements.length > 0;

  const handleCopy = () => {
    if (!isRequirementModel(model)) return Promise.resolve();
    return copyHtmlAndText(
      modelToRequirementsHtml(model),
      modelToRequirementsCsv(model)
    );
  };
  const handleSave = () => {
    if (!isRequirementModel(model)) return;
    downloadTextFile(
      sessionFilename(sessionName, 'requirements', 'csv'),
      modelToRequirementsCsv(model),
      'text/csv'
    );
  };

  const derivesFrom = (targetId: string): string[] =>
    model.relations
      .filter((r) => r.kind === 'derive' && r.targetId === targetId)
      .map((r) => r.sourceId);

  const handleToggleHidden = (id: string) => {
    useModelStore.getState().toggleRequirementHidden(id);
  };

  const handleDelete = (id: string) => {
    const reason = window.prompt(
      'Reason for deletion (required, kept as evidence per ADR-014):',
      ''
    );
    if (reason === null) return; // cancelled
    const trimmed = reason.trim();
    if (!trimmed) {
      window.alert('A non-empty reason is required.');
      return;
    }
    useModelStore.getState().markRequirementDeleted(id, trimmed);
  };

  const handleUndelete = (id: string) => {
    useModelStore.getState().unmarkRequirementDeleted(id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500">
          {model.requirements.length} requirement
          {model.requirements.length === 1 ? '' : 's'} (
          {model.requirements.filter((r) => r.deleted).length} deleted,{' '}
          {model.requirements.filter((r) => r.hidden).length} hidden)
        </span>
        <ExportActions
          onCopy={handleCopy}
          onSave={handleSave}
          copyTitle="Copy requirements. HTML payload for Excel / Sheets / Word; plain-text payload is the CSV defined in SR-113 / §3.13."
          saveLabel="Save .csv"
          saveTitle="Download the requirement list CSV. Round-trips with SR-110 seed form."
          disabled={!hasAny}
        />
      </div>
      <div className="overflow-auto flex-1 p-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {[
                '',
                'id',
                'name',
                'type',
                'text',
                'contained_in',
                'derives_from',
                'note',
                '',
              ].map((h, i) => (
                <th
                  key={i}
                  className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-medium text-gray-600 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.requirements.map((r) => {
              const deletedClass = r.deleted
                ? 'line-through text-gray-400 bg-gray-50'
                : '';
              const hiddenClass =
                r.hidden && !r.deleted ? 'text-gray-500 italic' : '';
              return (
                <tr key={r.id} className={`${deletedClass} ${hiddenClass}`}>
                  <td className="border border-gray-300 px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={!r.hidden && !r.deleted}
                      disabled={r.deleted}
                      onChange={() => handleToggleHidden(r.id)}
                      title={
                        r.deleted
                          ? 'Deleted (undelete to restore)'
                          : r.hidden
                            ? 'Show in diagram'
                            : 'Hide from diagram'
                      }
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1 font-mono whitespace-nowrap">
                    {r.id}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {r.name}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600 whitespace-nowrap">
                    {TYPE_LABEL[r.type]}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-gray-600">
                    {r.text ?? ''}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 font-mono whitespace-nowrap">
                    {r.parentId ?? ''}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 font-mono whitespace-nowrap">
                    {derivesFrom(r.id).join('; ')}
                  </td>
                  <td
                    className={`border border-gray-300 px-2 py-1 ${
                      r.deleted ? 'text-amber-700' : 'text-gray-600'
                    }`}
                  >
                    {r.note}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center whitespace-nowrap">
                    {r.deleted ? (
                      <button
                        type="button"
                        onClick={() => handleUndelete(r.id)}
                        className="text-xs px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-50"
                        title="Restore this requirement (removes the deleted flag; keeps the reason in the note)."
                      >
                        Undelete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="text-xs px-1.5 py-0.5 text-red-600 border border-red-200 rounded hover:bg-red-50"
                        title="Soft-delete with a reason (ADR-014). Row stays as evidence."
                      >
                        Delete…
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
