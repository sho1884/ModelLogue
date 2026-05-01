// SR-130 — confirmation modal for the apply-time review-evidence
// guardrail. Renders when chatStore.pendingGuardrail is non-null.
//
// Two outcomes:
//   - Apply anyway: the user accepts that the listed requirements
//     will be lost (no audit record). Triggers the actual apply.
//   - Cancel: the user wants to ask the AI to fix the response.
//     Closes the modal without applying. The proposed message stays
//     in the chat; the user can re-prompt.
//
// Easy English text, consistent with the rest of the UI's labels.

import type { DroppedRequirement } from '../../modelTypes/requirement/applyGuardrail';

interface ApplyGuardrailModalProps {
  dropped: DroppedRequirement[];
  onApplyAnyway: () => void;
  onCancel: () => void;
}

export function ApplyGuardrailModal({
  dropped,
  onApplyAnyway,
  onCancel,
}: ApplyGuardrailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-guardrail-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2
            id="apply-guardrail-title"
            className="text-base font-semibold text-gray-900"
          >
            Some requirements would be lost
          </h2>
        </div>
        <div className="px-5 py-4 overflow-y-auto text-sm text-gray-700 space-y-3">
          <p>
            The proposed update removes these requirements entirely.
            Applying will lose them with no audit record.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {dropped.map((d) => (
              <li key={d.id}>
                <span className="font-mono text-gray-900">{d.id}</span>
                {d.statement && (
                  <>
                    {' '}
                    — <span className="text-gray-700">{d.statement}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="text-gray-600">
            To keep them as evidence, cancel and ask the AI to mark
            them deleted=Y with a reason instead of removing them.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onApplyAnyway}
            className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700"
          >
            Apply anyway
          </button>
        </div>
      </div>
    </div>
  );
}
