import { useSessionStore } from '../../stores/sessionStore';

export function Header() {
  const sessionName = useSessionStore((s) => s.sessionName);

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-800">ModelLogue</h1>
        <span className="text-sm text-gray-500">{sessionName}</span>
      </div>
      <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">
        Export
      </button>
    </header>
  );
}
