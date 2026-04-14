import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useSessionStore } from '../../stores/sessionStore';
import type { ChatMessage } from '../../types/session';

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const lastError = useChatStore((s) => s.lastError);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sourceHistory = useSessionStore((s) => s.sourceHistory);

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
    <div className="flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b border-gray-200 text-sm font-medium text-gray-700 shrink-0 flex items-center justify-between">
        <span>Chat</span>
        {sourceHistory.length > 0 && <UndoButton />}
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
  const applyProposal = useSessionStore((s) => s.applyProposal);
  const markApplied = useChatStore((s) => s.markApplied);

  const isApplied = message.applied === true;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg text-sm ${
          isUser
            ? 'bg-indigo-600 text-white px-3 py-2'
            : 'bg-gray-100 text-gray-800 border border-gray-200'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <AssistantContent
            content={message.content}
            suggestedSource={message.suggestedSource}
            isApplied={isApplied}
            onApply={() => {
              if (message.suggestedSource) {
                applyProposal(message.id, message.suggestedSource);
                markApplied(message.id);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function AssistantContent({
  content,
  suggestedSource,
  isApplied,
  onApply,
}: {
  content: string;
  suggestedSource?: string;
  isApplied: boolean;
  onApply: () => void;
}) {
  // Remove the ```plantuml block from the display text since we show
  // it separately with the Apply button.
  const displayText = suggestedSource
    ? content.replace(/```plantuml\s*\n[\s\S]*?```/, '').trim()
    : content;

  return (
    <div>
      {displayText && (
        <div className="px-3 py-2 whitespace-pre-wrap break-words">
          {displayText}
        </div>
      )}
      {suggestedSource && (
        <div className="border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              PlantUML修正案
            </span>
            {isApplied ? (
              <span className="text-xs text-green-600 font-medium">
                ✓ Applied
              </span>
            ) : (
              <button
                onClick={onApply}
                className="px-2 py-0.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700"
              >
                Apply
              </button>
            )}
          </div>
          <pre className="px-3 py-2 text-xs text-gray-600 overflow-auto max-h-40 border-t border-gray-200">
            {suggestedSource}
          </pre>
        </div>
      )}
    </div>
  );
}

function UndoButton() {
  const undoSource = useSessionStore((s) => s.undoSource);
  return (
    <button
      onClick={undoSource}
      title="Undo last applied change"
      className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
    >
      ↩ Undo
    </button>
  );
}
