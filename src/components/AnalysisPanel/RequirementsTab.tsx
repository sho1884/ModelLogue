import { useEffect, useState } from 'react';
import {
  useRequirementsStore,
  REQUIREMENTS_SOFT_LIMIT,
  REQUIREMENTS_HARD_LIMIT,
} from '../../stores/requirementsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useChatStore } from '../../stores/chatStore';

// SR-080 / SR-082 (v7.1): the Requirements tab. Editable while the
// session has no model yet; read-only thereafter. "Generate Model" is a
// chat shortcut that asks the AI to author the initial source from this
// text.

const GENERATE_PREFIX =
  'Generate a PlantUML state diagram (in the supported subset) that ' +
  'satisfies the following requirements. Return the source inside a ' +
  '```plantuml code block.\n\n---\n';

export function RequirementsTab() {
  const requirementsText = useRequirementsStore((s) => s.requirementsText);
  const setRequirementsText = useRequirementsStore(
    (s) => s.setRequirementsText
  );
  const hasEstablishedModel = useSessionStore((s) => s.hasEstablishedModel);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isSending = useChatStore((s) => s.isSending);

  // SR-080 (v7.2): editable until the session enters REVIEW phase.
  const isSeedable = !hasEstablishedModel;
  const count = requirementsText.length;
  const overSoft = count > REQUIREMENTS_SOFT_LIMIT;
  const overHard = count > REQUIREMENTS_HARD_LIMIT;

  const canGenerate =
    isSeedable && requirementsText.trim().length > 0 && !overHard && !isSending;

  // Local draft lets the user paste past the soft limit without being
  // silently truncated, but the store rejects writes beyond the hard
  // limit to keep the prompt payload bounded.
  const [draft, setDraft] = useState(requirementsText);
  useEffect(() => {
    setDraft(requirementsText);
  }, [requirementsText]);

  const handleChange = (value: string) => {
    if (!isSeedable) return;
    setDraft(value);
    if (value.length <= REQUIREMENTS_HARD_LIMIT) {
      setRequirementsText(value);
    }
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    sendMessage(GENERATE_PREFIX + requirementsText);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1 bg-gray-50 border-b border-gray-200 text-xs text-gray-600 flex items-center justify-between">
        <span>
          {isSeedable
            ? 'Paste or type the requirements fragment that this model should satisfy. Locked once a model is generated or applied.'
            : 'Read-only during review. Re-deriving the requirements from the final model is an external step.'}
        </span>
        <span
          className={
            overHard
              ? 'text-red-600 font-medium'
              : overSoft
                ? 'text-amber-600'
                : 'text-gray-500'
          }
        >
          {count.toLocaleString()} / {REQUIREMENTS_SOFT_LIMIT.toLocaleString()} chars
          {overHard && ' — over limit'}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={!isSeedable}
        placeholder={
          isSeedable
            ? 'e.g. The device has three states: Idle, Active, Error...'
            : ''
        }
        className={`flex-1 p-3 text-sm font-mono resize-none outline-none ${
          isSeedable ? 'bg-white' : 'bg-gray-50 text-gray-700'
        }`}
        spellCheck={false}
      />
      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex items-center gap-2">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
          title={
            !isSeedable
              ? 'A model is already present; ask the AI in chat for further changes'
              : overHard
                ? 'Exceeds the 8000-character hard limit; extract a shorter fragment'
                : requirementsText.trim().length === 0
                  ? 'Enter requirements text first'
                  : 'Send "generate model" to the AI using this requirements text'
          }
        >
          Generate Model
        </button>
        {overSoft && !overHard && (
          <span className="text-xs text-amber-700">
            Soft limit exceeded — consider trimming before sending.
          </span>
        )}
      </div>
    </div>
  );
}
