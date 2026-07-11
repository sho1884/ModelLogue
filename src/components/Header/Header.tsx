import { useRef, useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useRequirementsStore } from '../../stores/requirementsStore';
import { useUiStore } from '../../stores/uiStore';
import { SaveAndFinishDialog } from '../SaveAndFinishDialog';
import grammarSpec from '../../grammars/stateDiagram.ebnf?raw';
import { downloadTextFile } from '../../services/download';
import { importParsedJson } from '../../services/reviewImport';
import { MODEL_TYPE_REGISTRY } from '../../modelTypes/registry';

// SR-142: the published user manual, opened from the header.
const MANUAL_URL = 'https://sho1884.github.io/public-files/ModelLogue/';

// SR-081: EBNF grammar is available as a download; no in-app viewer.
function downloadEbnf() {
  // .txt (not .ebnf) so it opens in any editor without a mime/handler prompt.
  downloadTextFile(
    'modellogue-state-diagram-grammar.txt',
    grammarSpec,
    'text/plain'
  );
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
  const modelTypeId = useSessionStore((s) => s.modelTypeId);
  const hasEstablishedModel = useSessionStore((s) => s.hasEstablishedModel);
  const setModelTypeId = useSessionStore((s) => s.setModelTypeId);
  const requirementsText = useRequirementsStore((s) => s.requirementsText);
  const aiAvailable = useUiStore((s) => s.aiAvailable);
  const importError = useUiStore((s) => s.importError);
  const setImportError = useUiStore((s) => s.setImportError);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent =
    currentSource.trim() !== '' || requirementsText.trim() !== '';

  // SR-073: during SEED the selector is a `<select>`; after REVIEW it
  // is a read-only label. Switching during SEED clears seed-phase
  // input (see sessionStore.setModelTypeId) so we confirm first if
  // anything is in-progress.
  const activeTypeLabel =
    MODEL_TYPE_REGISTRY.find((t) => t.id === modelTypeId)?.label ?? modelTypeId;

  const handleModelTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const nextId = e.target.value;
    if (nextId === modelTypeId) return;
    if (hasContent) {
      const ok = window.confirm(
        'Switching the model type clears the current seed inputs (source, requirements, chat). Continue?'
      );
      if (!ok) {
        e.target.value = modelTypeId;
        return;
      }
    }
    setModelTypeId(nextId);
  };

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
      // A full ReviewSession (carries a conversation) is restored whole so the
      // discussion can continue; a bare seed bundle just seeds the source.
      importParsedJson(parsed);
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
          <span
            className="text-[10px] text-gray-400 font-mono"
            title="Build time (Asia/Tokyo) — the running build's version"
          >
            {__BUILD_TIME__.slice(0, 16).replace('T', ' ')}
          </span>
          <span className="text-sm text-gray-500">{sessionName}</span>
          {/* SR-073: model-type selector / locked label */}
          {hasEstablishedModel ? (
            <span
              className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600"
              title="Model type is locked once the session enters REVIEW phase."
            >
              Model: {activeTypeLabel}
            </span>
          ) : (
            <label
              className="text-xs text-gray-600 flex items-center gap-1"
              title="Choose the model type for this session. Switching clears seed inputs."
            >
              Model:
              <select
                value={modelTypeId}
                onChange={handleModelTypeChange}
                className="px-1 py-0.5 border border-gray-300 rounded text-xs bg-white"
              >
                {MODEL_TYPE_REGISTRY.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {outcome && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
              {OUTCOME_LABELS[outcome.status]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* SR-140: Sign-in entry point. Shown only when AI is unavailable
              (the anonymous view). A top-level navigation — not a fetch — so
              the edge auth gate can present its login; it returns to `/` and
              the app re-probes /auth/whoami (SR-136). Inert with no gate. */}
          {!aiAvailable && (
            <button
              onClick={() => {
                window.location.href = '/auth/login';
              }}
              className="px-3 py-1 text-sm border border-indigo-300 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
              title="Sign in to enable AI. Redirects to the authentication gate and returns you here once signed in."
            >
              Sign in
            </button>
          )}
          {/* SR-142: link to the published user manual (always available). */}
          <a
            href={MANUAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            title="ユーザーマニュアルを新しいタブで開く"
          >
            Manual
          </a>
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
