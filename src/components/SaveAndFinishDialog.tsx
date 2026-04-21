import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { downloadTextFile, sessionFilename } from '../services/download';
import type { SessionOutcomeStatus } from '../types/session';

// SR-041 (v7.2): Save & finish dialog. Headline change vs. the old
// "Close session" — every label here makes clear that a file is
// produced and lists exactly what it contains.

const OUTCOMES: {
  status: SessionOutcomeStatus;
  label: string;
  description: string;
}[] = [
  {
    status: 'consensus',
    label: 'Agreed',
    description: 'All concerns resolved; the model is approved.',
  },
  {
    status: 'postponed',
    label: 'Postponed',
    description: 'Open issues remain; pick this up in a follow-up review.',
  },
  {
    status: 'spec_issue',
    label: 'Spec issue',
    description:
      'The blocker is upstream — the requirements need to change before the model can.',
  },
];

const CONTENTS: { label: string; detail: string }[] = [
  {
    label: 'Final PlantUML source',
    detail: 'the model you ended up with',
  },
  { label: 'Requirements text', detail: 'what you started from' },
  { label: 'Full chat log', detail: 'the dialogue that shaped the model' },
  {
    label: 'All applied source snapshots',
    detail: "every step of the model's evolution",
  },
  { label: 'Markers', detail: 'review annotations on the diagram' },
  { label: 'Outcome and optional note', detail: 'what you chose below' },
  { label: 'Session metadata', detail: 'id, name, timestamps' },
];

interface SaveAndFinishDialogProps {
  onClose: () => void;
}

export function SaveAndFinishDialog({ onClose }: SaveAndFinishDialogProps) {
  const closeSession = useSessionStore((s) => s.closeSession);
  const exportSession = useSessionStore((s) => s.exportSession);
  const sessionName = useSessionStore((s) => s.sessionName);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<SessionOutcomeStatus | null>(null);
  const [done, setDone] = useState(false);

  const handleSave = () => {
    if (!outcome) return;
    closeSession(outcome, note.trim() || null);
    const session = exportSession();
    const json = JSON.stringify(session, null, 2);
    downloadTextFile(
      sessionFilename(sessionName, 'review', 'json'),
      json,
      'application/json'
    );
    setDone(true);
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Saved.
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            The review evidence has been downloaded as a JSON file. You can
            re-open it later via <span className="font-medium">Open saved
            review…</span> in the header.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded bg-gray-700 text-white hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Save review evidence
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Pick the outcome, then download this review session as a JSON file.
          Nothing is discarded — the file is what you keep and what you can
          re-open later.
        </p>

        <div className="mb-4 border border-gray-200 rounded bg-gray-50 px-3 py-2">
          <div className="text-xs font-medium text-gray-700 mb-1">
            This file will contain:
          </div>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {CONTENTS.map((c) => (
              <li key={c.label} className="flex">
                <span className="text-green-600 mr-1.5">✓</span>
                <span>
                  <span className="font-medium text-gray-800">{c.label}</span>
                  <span className="text-gray-500"> — {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Outcome
          </label>
          <div className="space-y-1.5">
            {OUTCOMES.map((o) => (
              <label
                key={o.status}
                className={`block w-full text-left px-3 py-2 rounded border cursor-pointer ${
                  outcome === o.status
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={o.status}
                  checked={outcome === o.status}
                  onChange={() => setOutcome(o.status)}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-800">
                  {o.label}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {o.description}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Optional note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything to add about this outcome…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!outcome}
            className="px-4 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}
