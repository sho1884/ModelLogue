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
}

export function ExportActions({
  onCopy,
  onSave,
  copyLabel = 'Copy',
  saveLabel = 'Save',
  copyTitle,
  saveTitle,
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
        className="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
      >
        {copyLabel}
      </button>
      <button
        onClick={onSave}
        title={saveTitle}
        className="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
      >
        {saveLabel}
      </button>
    </div>
  );
}
