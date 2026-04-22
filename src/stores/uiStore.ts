import { create } from 'zustand';

// Active analysis-panel tab id. v7.5 onwards this is a free string
// because the tab set is built dynamically from the active
// ModelTypeDefinition.analysisTabs (SR-071, ADR-012). Known ids today:
//   'requirements' | 'source' (common)
//   'state-event' | 'state-state' | 'test-cases' (state-machine)
//   'requirement-list' | 'traceability' | 'orphans' (requirement, v7.5 step 5+)
export type AnalysisTab = string;

interface UiStore {
  analysisPanelHeight: number;
  analysisPanelCollapsed: boolean;
  activeAnalysisTab: AnalysisTab;
  chatPanelWidth: number;

  plantUmlStatus: 'connected' | 'disconnected' | 'checking';
  n8nStatus: 'connected' | 'disconnected' | 'checking';

  setAnalysisPanelHeight: (height: number) => void;
  toggleAnalysisPanel: () => void;
  setActiveAnalysisTab: (tab: AnalysisTab) => void;
  setChatPanelWidth: (width: number) => void;
  setPlantUmlStatus: (status: UiStore['plantUmlStatus']) => void;
  setN8nStatus: (status: UiStore['n8nStatus']) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  analysisPanelHeight: 250,
  analysisPanelCollapsed: false,
  activeAnalysisTab: 'requirements',
  chatPanelWidth: 320,

  plantUmlStatus: 'disconnected',
  n8nStatus: 'disconnected',

  setAnalysisPanelHeight: (height) => set({ analysisPanelHeight: height }),
  toggleAnalysisPanel: () =>
    set((s) => ({ analysisPanelCollapsed: !s.analysisPanelCollapsed })),
  setActiveAnalysisTab: (tab) => set({ activeAnalysisTab: tab }),
  setChatPanelWidth: (width) => set({ chatPanelWidth: width }),
  setPlantUmlStatus: (status) => set({ plantUmlStatus: status }),
  setN8nStatus: (status) => set({ n8nStatus: status }),
}));
