import { useUiStore } from '../../stores/uiStore';

function StatusIndicator({
  label,
  status,
}: {
  label: string;
  status: 'connected' | 'disconnected' | 'checking';
}) {
  const color =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'checking'
        ? 'bg-yellow-500'
        : 'bg-red-500';

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

export function StatusBar() {
  const plantUmlStatus = useUiStore((s) => s.plantUmlStatus);
  const n8nStatus = useUiStore((s) => s.n8nStatus);

  return (
    <footer className="flex items-center gap-4 px-4 py-1 border-t border-gray-200 bg-gray-50">
      <StatusIndicator label="PlantUML Server" status={plantUmlStatus} />
      <StatusIndicator label="n8n" status={n8nStatus} />
    </footer>
  );
}
