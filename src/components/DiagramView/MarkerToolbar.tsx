import { useMarkerStore } from '../../stores/markerStore';
import type { DiagramTool } from '../../types/marker';

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

export function MarkerToolbar() {
  const activeTool = useMarkerStore((s) => s.activeTool);
  const setActiveTool = useMarkerStore((s) => s.setActiveTool);

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50">
      <span className="text-xs text-gray-500 mr-2">Tool:</span>
      {tools.map((tool) => (
        <button
          key={tool.type}
          onClick={() => setActiveTool(tool.type)}
          title={tool.label}
          className={`px-2 py-1 text-base rounded inline-flex items-center justify-center ${
            activeTool === tool.type
              ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
              : 'text-gray-600 hover:bg-gray-100 border border-transparent'
          }`}
        >
          {tool.render()}
        </button>
      ))}
    </div>
  );
}
