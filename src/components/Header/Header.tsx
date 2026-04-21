import { useRef, useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useRequirementsStore } from '../../stores/requirementsStore';
import { SaveAndFinishDialog } from '../SaveAndFinishDialog';
import grammarSpec from '../../grammars/stateDiagram.ebnf?raw';
import { downloadTextFile } from '../../services/download';
import type { SeedBundle } from '../../types/session';

// SR-081: EBNF grammar is available as a download; no in-app viewer.
function downloadEbnf() {
  downloadTextFile(
    'modellogue-state-diagram-grammar.ebnf',
    grammarSpec,
    'text/plain'
  );
}

// SR-083 (v7.2): accept either a SeedBundle or a full ReviewSession JSON.
// A ReviewSession has a `messages` array; in that case we extract just
// the seed-relevant fields and discard chat / history / markers / outcome
// (Volatile Canvas: only static seeds round-trip).
function coerceToSeedBundle(parsed: unknown): SeedBundle {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('File is not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  const seed: SeedBundle = {};
  if (typeof obj.requirementsText === 'string') {
    seed.requirementsText = obj.requirementsText;
  }
  if (typeof obj.plantUmlSource === 'string') {
    seed.plantUmlSource = obj.plantUmlSource;
  }
  if (typeof obj.sessionName === 'string') {
    seed.sessionName = obj.sessionName;
  } else if (typeof obj.name === 'string') {
    // ReviewSession uses `name` (not `sessionName`)
    seed.sessionName = obj.name;
  }
  if (
    seed.requirementsText === undefined &&
    seed.plantUmlSource === undefined
  ) {
    throw new Error(
      'No requirementsText or plantUmlSource found in the file'
    );
  }
  return seed;
}

const OUTCOME_LABELS: Record<string, string> = {
  consensus: '✓ Agreed',
  postponed: '⏸ Postponed',
  spec_issue: '⚠ Spec issue',
};

export function Header() {
  const sessionName = useSessionStore((s) => s.sessionName);
  const outcome = useSessionStore((s) => s.outcome);
  const currentSource = useSessionStore((s) => s.currentSource);
  const requirementsText = useRequirementsStore((s) => s.requirementsText);
  const bootstrapFromBundle = useSessionStore((s) => s.bootstrapFromBundle);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent =
    currentSource.trim() !== '' || requirementsText.trim() !== '';

  const handleImportClick = () => {
    if (hasContent) {
      const ok = window.confirm(
        'Opening a saved review will replace the current session. Continue?'
      );
      if (!ok) return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const seed = coerceToSeedBundle(parsed);
      bootstrapFromBundle(seed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Failed to open file'
      );
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-800">ModelLogue</h1>
          <span className="text-sm text-gray-500">{sessionName}</span>
          {outcome && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
              {OUTCOME_LABELS[outcome.status]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            title="Load a previously saved review (.json) to continue, or a starter file prepared by an external workflow."
          >
            Open saved review…
          </button>
          <button
            onClick={downloadEbnf}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            title="Download the PlantUML subset grammar (EBNF)"
          >
            Download grammar
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-3 py-1 text-sm border border-indigo-300 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
            title="Save the review evidence as a JSON file and mark the outcome"
          >
            Save & finish…
          </button>
        </div>
      </header>
      {importError && (
        <div className="px-4 py-1 bg-red-50 border-b border-red-200 text-xs text-red-600">
          Open saved review failed: {importError}
        </div>
      )}
      {showSaveDialog && (
        <SaveAndFinishDialog onClose={() => setShowSaveDialog(false)} />
      )}
    </>
  );
}
