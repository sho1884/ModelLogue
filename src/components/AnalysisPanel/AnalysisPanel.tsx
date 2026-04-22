import { useUiStore } from '../../stores/uiStore';
import { SourceEditor } from './SourceEditor';
import { RequirementsTab } from './RequirementsTab';
import { ResizeHandle } from '../ResizeHandle';
import { getDefaultModelTypeDefinition } from '../../modelTypes/registry';
import type { AnalysisTabSpec } from '../../modelTypes/types';

// Common tabs are defined here — they apply to every model type.
// Type-specific tabs (S×E / S×S / Test cases for state machine, and
// later Requirement list / Traceability / Orphans for requirement)
// come from the active ModelTypeDefinition.analysisTabs (ADR-012).
const commonTabs: AnalysisTabSpec[] = [
  {
    id: 'requirements',
    label: 'Requirements',
    render: () => <RequirementsTab />,
  },
  {
    id: 'source',
    label: 'Source',
    render: () => <SourceEditor />,
  },
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

  // v7.5 step 2: hardcoded to the default type. Step 3 replaces this
  // with `SessionStore.modelTypeId`.
  const modelType = getDefaultModelTypeDefinition();
  const tabs: AnalysisTabSpec[] = [...commonTabs, ...modelType.analysisTabs];

  const activeSpec = tabs.find((t) => t.id === activeTab);

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
          {collapsed ? '▲' : '▼'}
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

      {/* Tab content — fully driven by the active spec's render(). */}
      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          {activeSpec?.render() ?? null}
        </div>
      )}
    </div>
  );
}
