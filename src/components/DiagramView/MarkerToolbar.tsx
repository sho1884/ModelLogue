import { useMarkerStore } from '../../stores/markerStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import type { DiagramTool } from '../../types/marker';
import { svgToPngBlob } from '../../engines/diagramExport';
import { downloadBlob, downloadTextFile, sessionFilename } from '../../services/download';

function PointerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 2 L5 20 L9 16 L12 22 L14 21 L11 15 L17 15 Z" />
    </svg>
  );
}

const tools: {
  type: DiagramTool;
  label: string;
  render: () => React.ReactNode;
}[] = [
  {
    type: 'select',
    label: 'Select / move / resize',
    render: () => <PointerIcon />,
  },
  { type: 'pan', label: 'Pan canvas (drag to move)', render: () => '✋' },
  { type: 'ellipse', label: 'Ellipse marker', render: () => '⬭' },
  { type: 'rectangle', label: 'Rectangle marker', render: () => '▭' },
  { type: 'arrow', label: 'Arrow marker', render: () => '➜' },
];

// SR-035 (v7.2): Undo / Redo live on the diagram toolbar — they affect
// the model, so they belong with the model. They stay visible at all
// times, even in empty state (SR-070) — otherwise undoing back to empty
// would hide the redo affordance and trap the user.

interface MarkerToolbarProps {
  /** Hide the marker-drawing buttons when there is no diagram to mark on. */
  markersHidden?: boolean;
}

export function MarkerToolbar({ markersHidden = false }: MarkerToolbarProps) {
  const activeTool = useMarkerStore((s) => s.activeTool);
  const setActiveTool = useMarkerStore((s) => s.setActiveTool);
  const sourceHistory = useSessionStore((s) => s.sourceHistory);
  const redoStack = useSessionStore((s) => s.redoStack);
  const undoSource = useSessionStore((s) => s.undoSource);
  const redoSource = useSessionStore((s) => s.redoSource);
  const svgString = useModelStore((s) => s.svgString);
  const sessionName = useSessionStore((s) => s.sessionName);

  const canUndo = sourceHistory.length > 0;
  const canRedo = redoStack.length > 0;

  // Export the model diagram itself (SR-100 family). Markers are a volatile
  // working overlay and are intentionally not included.
  const saveSvg = () => {
    if (!svgString) return;
    downloadTextFile(
      sessionFilename(sessionName, 'diagram', 'svg'),
      svgString,
      'image/svg+xml'
    );
  };
  const savePng = async () => {
    if (!svgString) return;
    try {
      const blob = await svgToPngBlob(svgString);
      downloadBlob(sessionFilename(sessionName, 'diagram', 'png'), blob);
    } catch {
      // Rasterization failed (rare) — leave the SVG path as the fallback.
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50">
      {!markersHidden && (
        <>
          <span className="text-xs text-gray-500 mr-2">Tool:</span>
          {tools.map((tool) => (
            <button
              key={tool.type}
              onClick={() => setActiveTool(tool.type)}
              title={tool.label}
              className={`px-2 py-1 text-base rounded inline-flex items-center justify-center ${
                activeTool === tool.type
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  : 'text-gray-600 hover:bg-gray-100 border border-transparent'
              }`}
            >
              {tool.render()}
            </button>
          ))}
          <div className="mx-2 h-5 w-px bg-gray-300" />
        </>
      )}
      <button
        onClick={undoSource}
        disabled={!canUndo}
        title="Undo the last applied proposal"
        className="px-2 py-1 text-base rounded inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 border border-transparent disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        ↶
      </button>
      <button
        onClick={redoSource}
        disabled={!canRedo}
        title="Redo the next applied proposal"
        className="px-2 py-1 text-base rounded inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 border border-transparent disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        ↷
      </button>
      {svgString && (
        <>
          <div className="mx-2 h-5 w-px bg-gray-300" />
          <span className="text-xs text-gray-500 mr-1">Save:</span>
          <button
            onClick={saveSvg}
            title="Download the model diagram as an SVG (vector). Review markers are not included."
            className="px-2 py-1 text-xs rounded inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 border border-gray-300"
          >
            SVG
          </button>
          <button
            onClick={savePng}
            title="Download the model diagram as a PNG (image). Review markers are not included."
            className="px-2 py-1 text-xs rounded inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 border border-gray-300"
          >
            PNG
          </button>
        </>
      )}
    </div>
  );
}
