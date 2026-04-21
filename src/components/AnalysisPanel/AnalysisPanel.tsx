import { useUiStore, type AnalysisTab } from '../../stores/uiStore';
import { useModelStore } from '../../stores/modelStore';
import { SourceEditor } from './SourceEditor';
import { MatrixView } from './MatrixView';
import { RequirementsTab } from './RequirementsTab';
import { ResizeHandle } from '../ResizeHandle';

const tabs: { id: AnalysisTab; label: string }[] = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'source', label: 'Source' },
  { id: 'state-event', label: 'State\u00D7Event' },
  { id: 'state-state', label: 'State\u00D7State' },
];

// Resize bounds for the analysis panel height.
const MIN_HEIGHT = 100;
const MAX_HEIGHT_RATIO = 0.7; // up to 70% of the viewport height

export function AnalysisPanel() {
  const activeTab = useUiStore((s) => s.activeAnalysisTab);
  const setActiveTab = useUiStore((s) => s.setActiveAnalysisTab);
  const collapsed = useUiStore((s) => s.analysisPanelCollapsed);
  const togglePanel = useUiStore((s) => s.toggleAnalysisPanel);
  const height = useUiStore((s) => s.analysisPanelHeight);
  const setHeight = useUiStore((s) => s.setAnalysisPanelHeight);

  const stateEventMatrix = useModelStore((s) => s.stateEventMatrix);
  const stateStateMatrix = useModelStore((s) => s.stateStateMatrix);

  return (
    <div
      className="bg-white flex flex-col shrink-0"
      style={{ height: collapsed ? 32 : height }}
    >
      {/* Resize handle (hidden when collapsed) */}
      {!collapsed && (
        <ResizeHandle
          edge="top"
          value={height}
          onChange={setHeight}
          min={MIN_HEIGHT}
          max={Math.max(MIN_HEIGHT, window.innerHeight * MAX_HEIGHT_RATIO)}
        />
      )}

      {/* Tab bar with collapse toggle */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50 shrink-0">
        <button
          onClick={togglePanel}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B2' : '\u25BC'}
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (collapsed) togglePanel();
            }}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          {activeTab === 'requirements' && <RequirementsTab />}
          {activeTab === 'source' && <SourceEditor />}
          {activeTab === 'state-event' && (
            <MatrixView
              matrix={stateEventMatrix}
              title="State \ Event"
              exportSuffix="state-event"
            />
          )}
          {activeTab === 'state-state' && (
            <MatrixView
              matrix={stateStateMatrix}
              title="From \ To"
              exportSuffix="state-state"
            />
          )}
        </div>
      )}
    </div>
  );
}
