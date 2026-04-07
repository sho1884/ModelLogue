import { useEffect, useRef } from 'react';
import { DiagramView } from './DiagramView/DiagramView';
import { AnalysisPanel } from './AnalysisPanel/AnalysisPanel';
import { ChatPanel } from './ChatPanel/ChatPanel';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';
import { useUiStore } from '../stores/uiStore';
import { checkHealth } from '../services/plantUmlService';

export function MainLayout() {
  const currentSource = useSessionStore((s) => s.currentSource);
  const parseSource = useModelStore((s) => s.parseSource);
  const fetchCoordinates = useModelStore((s) => s.fetchCoordinates);
  const chatPanelWidth = useUiStore((s) => s.chatPanelWidth);
  const setPlantUmlStatus = useUiStore((s) => s.setPlantUmlStatus);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Parse source immediately on change
  useEffect(() => {
    parseSource(currentSource);
  }, [currentSource, parseSource]);

  // Fetch SVG with debounce (500ms)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchCoordinates(currentSource);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentSource, fetchCoordinates]);

  // Check PlantUML Server health on mount
  useEffect(() => {
    setPlantUmlStatus('checking');
    checkHealth().then((ok) =>
      setPlantUmlStatus(ok ? 'connected' : 'disconnected')
    );
  }, [setPlantUmlStatus]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Diagram + Analysis */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <DiagramView />
        <AnalysisPanel />
      </div>

      {/* Right: Chat */}
      <div style={{ width: chatPanelWidth }} className="shrink-0">
        <ChatPanel />
      </div>
    </div>
  );
}
