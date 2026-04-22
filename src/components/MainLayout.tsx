import { useEffect, useRef } from 'react';
import { DiagramView } from './DiagramView/DiagramView';
import { AnalysisPanel } from './AnalysisPanel/AnalysisPanel';
import { ChatPanel } from './ChatPanel/ChatPanel';
import { ResizeHandle } from './ResizeHandle';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';
import { useUiStore } from '../stores/uiStore';
import { useTestCasesStore } from '../stores/testCasesStore';
import { checkHealth as checkPlantUmlHealth } from '../services/plantUmlService';
import { checkHealth as checkN8nHealth } from '../services/n8nService';
import { isMockMode } from '../services/mockAi';
import { ScenarioRunner } from '../debug/ScenarioRunner';

// Resize bounds for the chat panel width.
const MIN_CHAT_WIDTH = 200;
const MAX_CHAT_WIDTH_RATIO = 0.6; // up to 60% of the viewport width

export function MainLayout() {
  const currentSource = useSessionStore((s) => s.currentSource);
  const parseSource = useModelStore((s) => s.parseSource);
  const fetchCoordinates = useModelStore((s) => s.fetchCoordinates);
  const parseErrors = useModelStore((s) => s.parseErrors);
  const model = useModelStore((s) => s.model);
  const chatPanelWidth = useUiStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useUiStore((s) => s.setChatPanelWidth);
  const setPlantUmlStatus = useUiStore((s) => s.setPlantUmlStatus);
  const setN8nStatus = useUiStore((s) => s.setN8nStatus);
  const requestTestCases = useTestCasesStore((s) => s.requestGeneration);
  const resetTestCases = useTestCasesStore((s) => s.reset);
  const nSwitchLevel = useTestCasesStore((s) => s.n);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const testCasesDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Parse source immediately on change
  useEffect(() => {
    parseSource(currentSource);
  }, [currentSource, parseSource]);

  // Fetch SVG with debounce (500ms). SR-070 (v7.2): when the source is
  // empty, do NOT call PlantUML Server — that returns a default welcome
  // image which would mislead users about supported syntax. The empty
  // SVG state is what DiagramView renders the empty-state guide from.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (currentSource.trim() === '') {
      useModelStore.setState({ svgString: null, svgFetchError: null });
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchCoordinates(currentSource);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentSource, fetchCoordinates]);

  // SR-103: request N-switch test cases after a clean parse, debounced
  // (same 500ms as SVG fetch). When the source is empty or the parser
  // reported errors, reset the tab to idle without calling the API.
  useEffect(() => {
    if (testCasesDebounceRef.current) {
      clearTimeout(testCasesDebounceRef.current);
    }
    if (
      currentSource.trim() === '' ||
      parseErrors.length > 0 ||
      !model ||
      model.states.length === 0
    ) {
      resetTestCases();
      return;
    }
    testCasesDebounceRef.current = setTimeout(() => {
      requestTestCases(currentSource);
    }, 500);
    return () => {
      if (testCasesDebounceRef.current) {
        clearTimeout(testCasesDebounceRef.current);
      }
    };
  }, [
    currentSource,
    parseErrors,
    model,
    nSwitchLevel,
    requestTestCases,
    resetTestCases,
  ]);

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

      {/* Debug: scripted scenario runner (only when mock AI is active) */}
      {isMockMode() && <ScenarioRunner />}
    </div>
  );
}
