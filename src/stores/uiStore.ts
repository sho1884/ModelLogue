import { create } from 'zustand';

export type AnalysisTab =
  | 'requirements'
  | 'source'
  | 'state-event'
  | 'state-state';

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
