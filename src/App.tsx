import { useEffect } from 'react';
import { Header } from './components/Header/Header';
import { MainLayout } from './components/MainLayout';
import { StatusBar } from './components/StatusBar/StatusBar';
import { importFromUrl } from './services/reviewImport';
import { useUiStore } from './stores/uiStore';

function App() {
  const setImportError = useUiStore((s) => s.setImportError);

  // SR-141: load a review / seed from a ?file=<url> query parameter at
  // startup. Orthogonal to auth (SR-136) — a file loads for anyone. Errors
  // surface as the shared non-blocking import-error banner (rendered by the
  // Header), leaving the app usable (empty).
  useEffect(() => {
    const file = new URLSearchParams(window.location.search).get('file');
    if (!file) return;
    let cancelled = false;
    importFromUrl(file).catch((err) => {
      if (cancelled) return;
      setImportError(
        `?file= の読み込みに失敗しました: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [setImportError]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <MainLayout />
      <StatusBar />
    </div>
  );
}

export default App;
