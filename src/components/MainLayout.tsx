import { useEffect, useRef } from 'react';
import { DiagramView } from './DiagramView/DiagramView';
import { AnalysisPanel } from './AnalysisPanel/AnalysisPanel';
import { ChatPanel } from './ChatPanel/ChatPanel';
import { ResizeHandle } from './ResizeHandle';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';
import { useUiStore } from '../stores/uiStore';
import { checkHealth as checkPlantUmlHealth } from '../services/plantUmlService';
import { checkHealth as checkN8nHealth } from '../services/n8nService';

// Resize bounds for the chat panel width.
const MIN_CHAT_WIDTH = 200;
const MAX_CHAT_WIDTH_RATIO = 0.6; // up to 60% of the viewport width

export function MainLayout() {
  const currentSource = useSessionStore((s) => s.currentSource);
  const parseSource = useModelStore((s) => s.parseSource);
  const fetchCoordinates = useModelStore((s) => s.fetchCoordinates);
  const chatPanelWidth = useUiStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useUiStore((s) => s.setChatPanelWidth);
  const setPlantUmlStatus = useUiStore((s) => s.setPlantUmlStatus);
  const setN8nStatus = useUiStore((s) => s.setN8nStatus);
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

  // Check PlantUML Server and n8n health on mount
  useEffect(() => {
    setPlantUmlStatus('checking');
    checkPlantUmlHealth().then((ok) =>
      setPlantUmlStatus(ok ? 'connected' : 'disconnected')
    );
    setN8nStatus('checking');
    checkN8nHealth().then((ok) =>
      setN8nStatus(ok ? 'connected' : 'disconnected')
    );
  }, [setPlantUmlStatus, setN8nStatus]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Diagram + Analysis */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <DiagramView />
        <AnalysisPanel />
      </div>

      {/* Resize handle between diagram/analysis area and chat */}
      <ResizeHandle
        edge="left"
        value={chatPanelWidth}
        onChange={setChatPanelWidth}
        min={MIN_CHAT_WIDTH}
        max={Math.max(MIN_CHAT_WIDTH, window.innerWidth * MAX_CHAT_WIDTH_RATIO)}
      />

      {/* Right: Chat */}
      <div style={{ width: chatPanelWidth }} className="shrink-0">
        <ChatPanel />
      </div>
    </div>
  );
}
