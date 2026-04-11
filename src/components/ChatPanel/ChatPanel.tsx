import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessage } from '../../types/session';

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const lastError = useChatStore((s) => s.lastError);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when a new message arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isSending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim() === '' || isSending) return;
    const toSend = draft;
    setDraft('');
    await sendMessage(toSend);
  };

  return (
    <div className="flex flex-col h-full border-l border-gray-200 bg-white">
      <div className="px-3 py-2 border-b border-gray-200 text-sm font-medium text-gray-700 shrink-0">
        Chat
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-3 space-y-3"
      >
        {messages.length === 0 && !isSending && (
          <div className="text-sm text-gray-400 text-center mt-8">
            Send a message to start reviewing the model.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isSending && (
          <div className="text-xs text-gray-500 italic">
            Waiting for AI response…
          </div>
        )}
        {lastError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {lastError}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-gray-200 shrink-0"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message (Ctrl/Cmd + Enter to send)"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          disabled={isSending}
        />
        <div className="flex justify-end mt-1">
          <button
            type="submit"
            disabled={isSending || draft.trim() === ''}
            className="px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-800 border border-gray-200'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
