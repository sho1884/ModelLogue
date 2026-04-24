import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useSessionStore } from '../../stores/sessionStore';
import { stashAutoMarkerBeforeIfApplicable } from '../../stores/autoMarkerApply';
import {
  getDefaultModelTypeDefinition,
  getModelTypeDefinition,
} from '../../modelTypes/registry';

function parseForActiveType(source: string) {
  const id = useSessionStore.getState().modelTypeId;
  const def = getModelTypeDefinition(id) ?? getDefaultModelTypeDefinition();
  return def.parse(source);
}
import type { ChatMessage } from '../../types/session';
import { ProposalView } from './ProposalView';

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
    <div className="flex flex-col h-full bg-white">
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
  const applyProposal = useSessionStore((s) => s.applyProposal);
  const markApplied = useChatStore((s) => s.markApplied);

  const isApplied = message.applied === true;

  const handleApply = () => {
    if (!message.suggestedSource) return;
    // SR-033 (v7.2): freeze the before SOURCE on the message before the
    // apply mutates the live source. The before SVG is rederived from
    // this source on render, not snapshotted, so coordinate extraction
    // is guaranteed to use a (svg, source) pair that came from the
    // same render. (Snapshotting the live SVG could capture a stale
    // image because PlantUML Server renders are debounced.)
    const beforeSource = useSessionStore.getState().currentSource;

    // v7.5: for requirement-type sessions, stash the pre-apply model so
    // the next fetchCoordinates can diff and draw added/changed auto-
    // markers. Initial generation (zero-requirement before) is skipped
    // inside the helper so the first apply doesn't splatter the whole
    // diagram in green.
    stashAutoMarkerBeforeIfApplicable();

    applyProposal(message.id, message.suggestedSource);
    markApplied(message.id, { beforeSource });
  };

  // Auto-apply cases:
  // - SR-034 (v7.2): state-machine only, and only when the session
  //   source is still empty — nothing to compare against, so requiring
  //   a user click would be noise.
  // - v7.5: requirement sessions always auto-apply. Per user direction
  //   ("diffのapplyなんて要らなくて、直接描き直した図に枠をつけちゃって")
  //   the before/after modal is replaced by live-diagram auto-markers;
  //   there's no Apply button to show, so don't require one.
  // Gated on parse success in both cases so an unparseable proposal
  // does NOT poison the session.
  useEffect(() => {
    if (
      message.role !== 'assistant' ||
      !message.suggestedSource ||
      message.applied
    ) {
      return;
    }
    const sessionModelTypeId = useSessionStore.getState().modelTypeId;
    const liveSourceEmpty =
      useSessionStore.getState().currentSource.trim() === '';
    // v7.5/v7.6: requirement and process sessions both auto-apply
    // every proposal because their ProposalView (state-machine-shaped
    // diff) would otherwise hide its Apply button for lack of a diff.
    // Review happens against the live diagram, not a before/after
    // modal, for these types.
    const shouldAutoApply =
      sessionModelTypeId === 'requirement' ||
      sessionModelTypeId === 'process' ||
      liveSourceEmpty;
    if (!shouldAutoApply) return;
    const { model, errors } = parseForActiveType(message.suggestedSource);
    if (!model || errors.length > 0) return;
    handleApply();
    // Run only when this message first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            message={message}
            isApplied={isApplied}
            onApply={handleApply}
          />
        )}
      </div>
    </div>
  );
}

function AssistantContent({
  message,
  isApplied,
  onApply,
}: {
  message: ChatMessage;
  isApplied: boolean;
  onApply: () => void;
}) {
  const liveSource = useSessionStore((s) => s.currentSource);
  const modelTypeId = useSessionStore((s) => s.modelTypeId);

  // For an applied message: use the source snapshotted at apply time so
  // the diff stays anchored to "what THIS proposal actually changed".
  // For a still-pending proposal: use the live source so the user can
  // judge it against the latest model.
  const beforeSource = message.frozenBeforeSource ?? liveSource;

  // SR-034 (v7.2): initial-generation proposals have no meaningful
  // "before" — don't render the before/after Proposal view at all for
  // them. Applies both to messages that have already been auto-applied
  // (frozenBeforeSource captured as empty) AND to messages that WILL
  // be auto-applied shortly (live source empty, proposal parses).
  const isInitialGen = useMemo(() => {
    if (message.applied && !message.frozenBeforeSource?.trim()) return true;
    if (
      !message.applied &&
      message.suggestedSource &&
      liveSource.trim() === ''
    ) {
      const r = parseForActiveType(message.suggestedSource);
      return r.model !== null && r.errors.length === 0;
    }
    return false;
  }, [
    message.applied,
    message.frozenBeforeSource,
    message.suggestedSource,
    liveSource,
  ]);

  // v7.5: requirement sessions don't use the before/after ProposalView
  // at all. Changes are shown as green/amber auto-markers on the live
  // diagram, apply is automatic, and the diff-free ProposalView would
  // otherwise render without an Apply button (state-machine diff shape
  // is empty for requirement models) — which looks to the user like a
  // dialog they can't dismiss.
  const showProposalView =
    modelTypeId !== 'requirement' && modelTypeId !== 'process';

  const displayText = message.suggestedSource
    ? message.content
        .replace(/```plantuml\s*\n[\s\S]*?```/, '')
        .replace(/```csv\s*\n[\s\S]*?```/i, '')
        .trim()
    : message.content;

  return (
    <div>
      {displayText && (
        <div className="px-3 py-2 whitespace-pre-wrap break-words">
          {displayText}
        </div>
      )}
      {showProposalView && message.suggestedSource && !isInitialGen && (
        <ProposalView
          currentSource={beforeSource}
          suggestedSource={message.suggestedSource}
          isApplied={isApplied}
          onApply={onApply}
        />
      )}
    </div>
  );
}

