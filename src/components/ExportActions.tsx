import { useState } from 'react';

// Shared Copy / Save action pair used by Source tab (SR-100) and the
// matrix tabs (SR-101). Copy shows a transient "Copied!" indicator on
// success and "Copy failed" on error, both for ~1.5s.

interface ExportActionsProps {
  onCopy: () => void | Promise<void>;
  onSave: () => void;
  copyLabel?: string;
  saveLabel?: string;
  copyTitle?: string;
  saveTitle?: string;
  /**
   * When true, both buttons render greyed out and ignore clicks. Used by
   * the Test cases tab to hide the actions until a test list exists.
   */
  disabled?: boolean;
}

export function ExportActions({
  onCopy,
  onSave,
  copyLabel = 'Copy',
  saveLabel = 'Save',
  copyTitle,
  saveTitle,
  disabled = false,
}: ExportActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await onCopy();
      setFeedback('Copied!');
    } catch {
      setFeedback('Copy failed');
    }
    window.setTimeout(() => setFeedback(null), 1500);
  };

  const buttonClass =
    'px-2 py-0.5 text-xs border rounded ' +
    (disabled
      ? 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed'
      : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50');

  return (
    <div className="flex items-center gap-1 shrink-0">
      {feedback && (
        <span
          className={
            feedback === 'Copied!'
              ? 'text-[11px] text-green-600'
              : 'text-[11px] text-red-600'
          }
        >
          {feedback}
        </span>
      )}
      <button
        onClick={handleCopy}
        title={copyTitle}
        disabled={disabled}
        className={buttonClass}
      >
        {copyLabel}
      </button>
      <button
        onClick={onSave}
        title={saveTitle}
        disabled={disabled}
        className={buttonClass}
      >
        {saveLabel}
      </button>
    </div>
  );
}
