import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useModelStore } from '../../stores/modelStore';
import { stashAutoMarkerBeforeIfApplicable } from '../../stores/autoMarkerApply';
import {
  getDefaultModelTypeDefinition,
  getModelTypeDefinition,
} from '../../modelTypes/registry';
import { detectDroppedRequirementIds } from '../../modelTypes/requirement/applyGuardrail';
import type { RequirementModel } from '../../modelTypes/requirement/model';
import {
  fetchSlackMessages,
  isSlackRelayEnabled,
} from '../../services/slackRelay';

function parseForActiveType(source: string) {
  const id = useSessionStore.getState().modelTypeId;
  const def = getModelTypeDefinition(id) ?? getDefaultModelTypeDefinition();
  return def.parse(source);
}
import type { ChatMessage } from '../../types/session';
import { effectiveSource } from '../../types/session';
import { ProposalView } from './ProposalView';
import { ApplyGuardrailModal } from './ApplyGuardrailModal';

// SR-132c: polling cadence for the Slack relay (Slack → ModelLogue
// direction). 1.5 seconds is the upper-bound polling interval that
// keeps end-to-end delivery under NFR-081's 4-second budget once
// Slack's own delivery delay (~1–2s) is added.
const SLACK_RELAY_POLL_MS = 1500;

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const lastError = useChatStore((s) => s.lastError);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const pendingGuardrail = useChatStore((s) => s.pendingGuardrail);
  const hasEstablishedModel = useSessionStore((s) => s.hasEstablishedModel);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when a new message arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isSending]);

  // SR-132c: poll the Slack relay while the session is in REVIEW
  // phase and the relay is enabled. Each tick fetches messages
  // newer than the latest seen ts and feeds them into chatStore.
  // Failures are logged via fetchSlackMessages's own try/catch
  // surface — we never tear down the chat pane on relay failure
  // (NFR-081).
  useEffect(() => {
    if (!hasEstablishedModel) return;
    if (!isSlackRelayEnabled()) return;

    let cancelled = false;
    let lastSeenTs: string | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const incoming = await fetchSlackMessages(lastSeenTs);
        for (const m of incoming) {
          useChatStore.getState().appendRelayedSlackMessage(m);
          // Track the highest ts observed so the next poll fetches
          // strictly the delta. Slack ts is monotonic per channel.
          if (
            lastSeenTs === null ||
            parseFloat(m.ts) > parseFloat(lastSeenTs)
          ) {
            lastSeenTs = m.ts;
          }
        }
      } catch (err) {
        console.warn('Slack relay poll failed:', err);
      }
    };

    // Fire one immediate poll so the first batch lands without
    // waiting a full interval, then settle into the cadence.
    void tick();
    const handle = setInterval(() => {
      void tick();
    }, SLACK_RELAY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [hasEstablishedModel]);

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

      {pendingGuardrail && <PendingGuardrailHandler />}
    </div>
  );
}

// SR-130: render the modal and own the resolution logic. Keeping this
// as a separate child component keeps the ChatPanel tree shallow and
// the modal's effects scoped to when it's actually open.
function PendingGuardrailHandler() {
  const pendingGuardrail = useChatStore((s) => s.pendingGuardrail);
  const setPendingGuardrail = useChatStore((s) => s.setPendingGuardrail);
  const messages = useChatStore((s) => s.messages);
  const markApplied = useChatStore((s) => s.markApplied);
  const applyProposal = useSessionStore((s) => s.applyProposal);

  if (!pendingGuardrail) return null;
  const message = messages.find((m) => m.id === pendingGuardrail.messageId);
  // If the message vanished (e.g. session cleared), drop the modal.
  if (!message || !message.suggestedSource) {
    setPendingGuardrail(null);
    return null;
  }

  const handleApplyAnyway = () => {
    const beforeSource = useSessionStore.getState().currentSource;
    stashAutoMarkerBeforeIfApplicable();
    applyProposal(message.id, message.suggestedSource!);
    markApplied(message.id, { beforeSource });
    setPendingGuardrail(null);
  };

  const handleCancel = () => {
    setPendingGuardrail(null);
  };

  return (
    <ApplyGuardrailModal
      dropped={pendingGuardrail.dropped}
      onApplyAnyway={handleApplyAnyway}
      onCancel={handleCancel}
    />
  );
}

// SR-134 (v7.8 planned): label + accent per source class. Slack
// participants share the assistant side (left) but get a green accent
// so they aren't mistaken for the AI.
function sourceLabel(source: ReturnType<typeof effectiveSource>): string {
  if (source === 'facilitator') return 'You';
  if (source === 'ai') return 'AI';
  if (source.startsWith('slack:')) {
    const name = source.slice('slack:'.length);
    return `Slack · ${name || 'unknown'}`;
  }
  return source;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const source = effectiveSource(message);
  const isFacilitator = source === 'facilitator';
  const isSlack = source.startsWith('slack:');
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

    // SR-130: apply-time review-evidence guardrail (requirement-type
    // only). If the AI's csv reply silently drops a row that was in
    // the previous model, pause the apply and route through the
    // confirmation modal instead of completing immediately.
    if (sessionModelTypeId === 'requirement') {
      const beforeModel = useModelStore.getState().model as
        | RequirementModel
        | null;
      const newRequirementModel = model as RequirementModel;
      const dropped = detectDroppedRequirementIds(
        beforeModel,
        newRequirementModel
      );
      if (dropped.length > 0) {
        useChatStore.getState().setPendingGuardrail({
          messageId: message.id,
          dropped,
        });
        return;
      }
    }

    handleApply();
    // Run only when this message first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visual classes by source (SR-134):
  //   facilitator  → right-aligned, indigo
  //   ai           → left-aligned, gray
  //   slack:<name> → left-aligned, gray bubble with green left border
  const bubbleClass = isFacilitator
    ? 'bg-indigo-600 text-white px-3 py-2'
    : isSlack
      ? 'bg-gray-100 text-gray-800 border border-gray-200 border-l-4 border-l-emerald-500'
      : 'bg-gray-100 text-gray-800 border border-gray-200';

  const labelClass = isFacilitator
    ? 'text-[10px] uppercase tracking-wide text-indigo-200 mb-0.5'
    : isSlack
      ? 'text-[10px] uppercase tracking-wide text-emerald-700 px-3 pt-1'
      : 'text-[10px] uppercase tracking-wide text-gray-500 px-3 pt-1';

  return (
    <div className={`flex ${isFacilitator ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg text-sm ${bubbleClass}`}>
        {isFacilitator ? (
          <>
            <div className={labelClass}>{sourceLabel(source)}</div>
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </>
        ) : isSlack ? (
          <>
            <div className={labelClass}>{sourceLabel(source)}</div>
            <div className="px-3 pb-2 whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </>
        ) : (
          <>
            <div className={labelClass}>{sourceLabel(source)}</div>
            <AssistantContent
              message={message}
              isApplied={isApplied}
              onApply={handleApply}
            />
          </>
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

