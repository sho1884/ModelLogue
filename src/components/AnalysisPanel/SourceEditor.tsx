import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import { useCodeMirror } from '../../editors/useCodeMirror';

export function SourceEditor() {
  const currentSource = useSessionStore((s) => s.currentSource);
  const updateSource = useSessionStore((s) => s.updateSource);
  const parseErrors = useModelStore((s) => s.parseErrors);

  const editorRef = useCodeMirror({
    value: currentSource,
    onChange: (value) => updateSource(value, 'manual'),
  });

  return (
    <div className="flex flex-col h-full">
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
