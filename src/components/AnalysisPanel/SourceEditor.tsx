import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import { useCodeMirror } from '../../editors/useCodeMirror';
import { ExportActions } from '../ExportActions';
import { copyToClipboard } from '../../services/clipboard';
import { downloadTextFile, sessionFilename } from '../../services/download';

// SR-001 (v7.2): the source is a read-only reference during REVIEW phase.
// During SEED phase (no parseable model yet), the editor stays editable
// so invalid PlantUML doesn't trap the user — they can fix or replace.

export function SourceEditor() {
  const currentSource = useSessionStore((s) => s.currentSource);
  const updateSource = useSessionStore((s) => s.updateSource);
  const sessionName = useSessionStore((s) => s.sessionName);
  const hasEstablishedModel = useSessionStore((s) => s.hasEstablishedModel);
  const modelTypeId = useSessionStore((s) => s.modelTypeId);
  const parseErrors = useModelStore((s) => s.parseErrors);

  // Editable while still in SEED phase. REVIEW phase is one-way.
  const isSeeding = !hasEstablishedModel;
  // v7.5: requirement-type sessions seed the buffer with the
  // !procedure preamble and the user's intended workflow is "write
  // prose in the Requirements tab, press Generate model" — the Source
  // tab is a read-only reference for the canonical output, not a text
  // input. State-machine sessions still accept a pasted source here.
  const isRequirementType = modelTypeId === 'requirement';

  // Editable only for state-machine SEED. Requirement sessions keep the
  // buffer read-only even during SEED because the preamble must stay
  // intact and the intended seed entry point is the Requirements tab.
  const editorReadOnly = !isSeeding || isRequirementType;

  const editorRef = useCodeMirror({
    value: currentSource,
    onChange: (value) => updateSource(value, 'seed'),
    readOnly: editorReadOnly,
  });

  const canExport = currentSource.trim() !== '';

  const hintText = isRequirementType
    ? isSeeding
      ? 'Read-only canonical PlantUML. Write requirements in the Requirements tab and press Generate model; updates arrive via AI chat proposals.'
      : 'Read-only canonical PlantUML. To change the model, update requirements in the chat panel and Apply the proposed list.'
    : isSeeding
      ? 'Paste your initial PlantUML source here. Once it parses successfully the source becomes read-only; further changes happen via AI chat proposals.'
      : 'Read-only. To change the model, ask the AI in the chat panel and Apply the proposed update.';

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1 bg-gray-50 border-b border-gray-200 text-xs text-gray-600 flex items-center justify-between gap-2">
        <span>{hintText}</span>
        {canExport && (
          <ExportActions
            onCopy={() => copyToClipboard(currentSource)}
            onSave={() =>
              downloadTextFile(
                sessionFilename(sessionName, '', 'puml'),
                currentSource,
                'text/plain'
              )
            }
            saveLabel="Save .puml"
            saveTitle="Download the current PlantUML source as a .puml file"
          />
        )}
      </div>
      <div ref={editorRef} className="flex-1 overflow-auto" />
      {parseErrors.length > 0 && (
        <div className="px-3 py-1 bg-red-50 border-t border-red-200 text-xs text-red-600">
          {parseErrors.map((e, i) => (
            <div key={i}>
              Line {e.line}: {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
