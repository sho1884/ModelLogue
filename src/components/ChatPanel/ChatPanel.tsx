import { useUiStore } from '../../stores/uiStore';

export function ChatPanel() {
  const n8nStatus = useUiStore((s) => s.n8nStatus);

  return (
    <div className="flex flex-col h-full border-l border-gray-200 bg-white">
      <div className="px-3 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
        Chat
      </div>
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-4">
        {n8nStatus === 'connected'
          ? 'Send a message to start reviewing'
          : 'n8n not connected'}
      </div>
      <div className="p-2 border-t border-gray-200">
        <input
          type="text"
          placeholder="Type a message..."
          disabled={n8nStatus !== 'connected'}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded disabled:bg-gray-100 disabled:text-gray-400"
        />
      </div>
    </div>
  );
}
