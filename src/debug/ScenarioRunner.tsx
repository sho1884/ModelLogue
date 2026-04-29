import { useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useRequirementsStore } from '../stores/requirementsStore';
import { useModelStore } from '../stores/modelStore';
import { stashAutoMarkerBeforeIfApplicable } from '../stores/autoMarkerApply';
import { enqueueMockResponses, clearMockQueue } from '../services/mockAi';
import { diffModels } from '../modelTypes/state-machine/diff';
import { parse } from '../modelTypes/state-machine/parser';
import { getModelTypeDefinition } from '../modelTypes/registry';
import { SCENARIOS, type Scenario } from './scenarios';

// Debug-only runner. Mounted from MainLayout only when the harness flag
// is on. See Doc/test/debug_harness.md.

type RunStatus = 'idle' | 'running' | 'paused' | 'stopped';

function sleep(ms: number, cancelRef: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (cancelRef.cancelled) return resolve();
      if (Date.now() - start >= ms) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// Mirror of ChatPanel.MessageBubble.handleApply for programmatic apply.
// The runner has to simulate the reviewer clicking Apply on each step's
// proposal; otherwise currentSource stays frozen at the initial model
// and subsequent proposals compare against the wrong baseline. Must
// mirror the full handleApply sequence — including the v7.5
// stashAutoMarkerBeforeIfApplicable stash — so requirement scenarios
// render the same auto-markers the live app would.
function autoApplyLatestProposal(): void {
  const messages = useChatStore.getState().messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || !last.suggestedSource) return;
  if (last.applied) return; // initial-gen auto-apply already handled it

  const beforeSource = useSessionStore.getState().currentSource;
  stashAutoMarkerBeforeIfApplicable();
  useSessionStore.getState().applyProposal(last.id, last.suggestedSource);
  useChatStore.getState().markApplied(last.id, { beforeSource });
}

export function ScenarioRunner() {
  const [selectedId, setSelectedId] = useState(SCENARIOS[0]?.id ?? '');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [stepIdx, setStepIdx] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentNote, setCurrentNote] = useState<string>('');
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const pauseRef = useRef<{ paused: boolean }>({ paused: false });

  const scenario = SCENARIOS.find((s) => s.id === selectedId);

  const run = async (sc: Scenario) => {
    cancelRef.current = { cancelled: false };
    pauseRef.current = { paused: false };

    // Reset state.
    clearMockQueue();
    useChatStore.getState().clear();
    useRequirementsStore.setState({ requirementsText: '' });

    // v7.5: seed the source with the target type's default template
    // (requirement sessions need the !procedure preamble in the buffer
    // from the first keystroke so PlantUML Server can render the
    // initial — empty — model without erroring). hasEstablishedModel
    // has to reset BEFORE the modelTypeId setter so the switch isn't
    // locked out.
    const targetType = sc.modelTypeId ?? 'state-machine';
    const targetDef = getModelTypeDefinition(targetType);
    useSessionStore.setState({
      modelTypeId: targetType,
      currentSource: targetDef?.defaultSeedSource ?? '',
      sourceHistory: [],
      redoStack: [],
      hasEstablishedModel: false,
      outcome: null,
    });

    if (sc.requirementsText) {
      useRequirementsStore.setState({ requirementsText: sc.requirementsText });
    }

    setTotalSteps(sc.steps.length);
    setStatus('running');

    for (let i = 0; i < sc.steps.length; i++) {
      if (cancelRef.current.cancelled) break;
      while (pauseRef.current.paused && !cancelRef.current.cancelled) {
        await sleep(100, cancelRef.current);
      }
      const step = sc.steps[i];
      setStepIdx(i + 1);
      setCurrentNote(step.note ?? '');
      enqueueMockResponses(step.mockReplies);
      await useChatStore.getState().sendMessage(step.userMessage);

      // Let the just-arrived assistant message render + auto-apply (if
      // source was empty) briefly before we try to apply manually.
      await sleep(200, cancelRef.current);

      // Simulate a user click on Apply for the latest proposal. Without
      // this, second+ steps would leave the live source frozen at the
      // initial model and every later proposal view would show its diff
      // against that old state — overlays go wrong and counts drift.
      autoApplyLatestProposal();

      await sleep(step.pauseMs ?? 1800, cancelRef.current);
    }

    if (!cancelRef.current.cancelled) setStatus('idle');
  };

  const handlePlay = () => {
    if (!scenario) return;
    if (status === 'paused') {
      pauseRef.current.paused = false;
      setStatus('running');
      return;
    }
    run(scenario);
  };

  const handlePause = () => {
    pauseRef.current.paused = true;
    setStatus('paused');
  };

  const handleStop = () => {
    cancelRef.current.cancelled = true;
    pauseRef.current.paused = false;
    clearMockQueue();
    setStatus('idle');
    setStepIdx(0);
    setTotalSteps(0);
    setCurrentNote('');
  };

  // Dumps enough state to diagnose overlay / sizing issues without
  // asking the user to do any manual DOM inspection. Prints one
  // console group so it's easy to copy/paste back.
  const handleDump = () => {
    const sess = useSessionStore.getState();
    const msStore = useModelStore.getState();
    const chat = useChatStore.getState();

    const currentSource = sess.currentSource;
    const svgString = msStore.svgString;
    const coords = msStore.coordinates;
    const liveModel = msStore.model;

    const latestAssistant = [...chat.messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.suggestedSource);
    const proposedSource = latestAssistant?.suggestedSource;
    const frozenBeforeSource = latestAssistant?.frozenBeforeSource;

    // Re-run the same extraction the Proposal view would do, so the
    // dump reflects what that view is actually computing.
    let proposalBefore: object = { skipped: 'no proposal found' };
    let proposalAfter: object = { skipped: 'no proposal found' };
    let proposalDiff: object = { skipped: 'no proposal found' };
    if (proposedSource) {
      const beforeSource = frozenBeforeSource ?? currentSource;
      const beforeParse = parse(beforeSource);
      const afterParse = parse(proposedSource);
      proposalBefore = {
        source_len: beforeSource.length,
        states: beforeParse.model?.states.length ?? 0,
        parse_errors: beforeParse.errors.length,
      };
      proposalAfter = {
        source_len: proposedSource.length,
        states: afterParse.model?.states.length ?? 0,
        parse_errors: afterParse.errors.length,
      };
      if (beforeParse.model && afterParse.model) {
        const d = diffModels(beforeParse.model, afterParse.model);
        proposalDiff = {
          addedStates: d.addedStates.map((s) => `${s.id}(${s.type})`),
          removedStates: d.removedStates.map((s) => `${s.id}(${s.type})`),
          changedStates: d.changedStates.map(
            (c) => `${c.after.id}(${c.after.type})`
          ),
          addedTx: d.addedTransitions.length,
          removedTx: d.removedTransitions.length,
          changedTx: d.changedTransitions.length,
        };
      }
    }

    // Also sample the rendered DOM to answer "is the overlay actually
    // drawn and if so, where?"
    const domSvgs = Array.from(document.querySelectorAll('svg'));
    const domSvgSummary = domSvgs.slice(0, 10).map((s, i) => ({
      i,
      viewBox: s.getAttribute('viewBox'),
      width: s.getAttribute('width') ?? s.style.width,
      height: s.getAttribute('height') ?? s.style.height,
      rects: s.querySelectorAll('rect').length,
      texts: s.querySelectorAll('text').length,
      class: s.getAttribute('class')?.slice(0, 60),
    }));

    // For every overlay SVG (our diff overlay — identified by the
    // pointer-events-none CSS class) list the actual rect positions.
    // That tells us whether the rect is IN the viewBox or drawn
    // outside the visible area.
    const overlayRects = domSvgs
      .filter((s) =>
        (s.getAttribute('class') ?? '').includes('pointer-events-none')
      )
      .map((s, i) => ({
        i,
        viewBox: s.getAttribute('viewBox'),
        rects: Array.from(s.querySelectorAll('rect')).map((r) => ({
          x: r.getAttribute('x'),
          y: r.getAttribute('y'),
          w: r.getAttribute('width'),
          h: r.getAttribute('height'),
          stroke: r.getAttribute('stroke'),
        })),
      }));

    // The diagram pane's dashed canvas — is its declared size tracking
    // svgInfo? This is the "wide model overflows" bug channel.
    const canvasDiv = document.querySelector('.border-dashed');
    const canvasInline = canvasDiv
      ? (canvasDiv as HTMLElement).style.cssText
      : null;
    const canvasBox = canvasDiv?.getBoundingClientRect();

    // Walk up the parent chain recording each level's computed
    // dimensions and transform. A NON-UNIFORM scale factor between
    // canvas inline size and rendered bounding rect means some
    // ancestor is imposing a non-obvious constraint; this dump
    // should pinpoint which one.
    const ancestorChain: Array<Record<string, unknown>> = [];
    let walker: Element | null = canvasDiv ?? null;
    let walkerDepth = 0;
    while (walker && walkerDepth < 10) {
      const cs = window.getComputedStyle(walker);
      const r = walker.getBoundingClientRect();
      ancestorChain.push({
        depth: walkerDepth,
        tag: walker.tagName,
        class: (walker.getAttribute('class') ?? '').slice(0, 80),
        cssW: cs.width,
        cssH: cs.height,
        transform: cs.transform,
        overflow: `${cs.overflowX}/${cs.overflowY}`,
        rectW: Math.round(r.width),
        rectH: Math.round(r.height),
      });
      walker = walker.parentElement;
      walkerDepth++;
    }

    // Print as a single JSON blob so every nested value is visible
    // when the user copy-pastes the console output back.
    const payload = {
      currentSource_length: currentSource.length,
      svgString_length: svgString?.length ?? 0,
      live_model_states:
        liveModel && 'states' in (liveModel as object)
          ? (liveModel as { states: { id: string; type: string }[] }).states.map(
              (s) => `${s.id}(${s.type})`
            )
          : null,
      live_extracted_coords: coords ? Object.fromEntries(coords) : null,
      latest_proposal: {
        id: latestAssistant?.id,
        applied: latestAssistant?.applied,
        hasSource: !!proposedSource,
        frozenBeforeSource: frozenBeforeSource?.slice(0, 40),
      },
      proposal_before: proposalBefore,
      proposal_after: proposalAfter,
      proposal_diff: proposalDiff,
      dashed_canvas_inline: canvasInline,
      dashed_canvas_rect: canvasBox
        ? {
            x: canvasBox.x,
            y: canvasBox.y,
            width: canvasBox.width,
            height: canvasBox.height,
          }
        : null,
      dashed_canvas_ancestors: ancestorChain,
      dom_svg_summary: domSvgSummary,
      overlay_rect_details: overlayRects,
      // First 2KB of the live svgString so we can see PlantUML's
      // actual output structure (necessary for diagnosing cases where
      // extractCoordinates misses states).
      live_svg_sample: svgString?.slice(0, 2000) ?? null,
    };
    // eslint-disable-next-line no-console
    console.log(
      '[ModelLogue] DIAGNOSTIC DUMP\n' + JSON.stringify(payload, null, 2)
    );
  };

  return (
    <div className="fixed bottom-3 right-3 z-40 w-72 bg-white border border-gray-300 rounded-lg shadow-lg text-xs">
      <div className="px-3 py-1.5 bg-amber-100 border-b border-amber-300 font-medium text-amber-900">
        Debug · Scenario Runner
      </div>
      <div className="p-3 space-y-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={status === 'running' || status === 'paused'}
          className="w-full px-2 py-1 border border-gray-300 rounded"
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {scenario && (
          <div className="text-[11px] text-gray-600 leading-snug">
            {scenario.description}
          </div>
        )}
        {status === 'running' || status === 'paused' ? (
          <div className="text-[11px] text-gray-700">
            Step {stepIdx} / {totalSteps}
            {currentNote && (
              <span className="text-gray-500"> — {currentNote}</span>
            )}
          </div>
        ) : null}
        <div className="flex gap-1.5">
          {status === 'running' ? (
            <button
              onClick={handlePause}
              className="flex-1 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >
              ⏸ Pause
            </button>
          ) : (
            <button
              onClick={handlePlay}
              disabled={!scenario}
              className="flex-1 px-2 py-1 border border-indigo-300 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 disabled:opacity-50"
            >
              {status === 'paused' ? '▶ Resume' : '▶ Play'}
            </button>
          )}
          <button
            onClick={handleStop}
            disabled={status === 'idle'}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            ⏹ Stop
          </button>
        </div>
        <button
          onClick={handleDump}
          className="w-full px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          title="Dump diagnostic state to browser console"
        >
          🔍 Dump diagnostics
        </button>
      </div>
    </div>
  );
}
