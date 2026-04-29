import { useEffect, useMemo, useState } from 'react';
import { fetchSvg, type SvgFetchResult } from '../../services/plantUmlService';
import {
  extractCoordinates,
  type CoordinateMap,
} from '../../engines/svgCoordinateExtractor';
import { isDiffEmpty, type ModelDiff } from '../../modelTypes/state-machine/diff';
import type { StateMachineModel } from '../../modelTypes/state-machine/model';
import { ProposalModal } from './ProposalModal';
import {
  getDefaultModelTypeDefinition,
  getModelTypeDefinition,
} from '../../modelTypes/registry';
import { useSessionStore } from '../../stores/sessionStore';

const EMPTY_DIFF: ModelDiff = {
  addedStates: [],
  removedStates: [],
  changedStates: [],
  addedTransitions: [],
  removedTransitions: [],
  changedTransitions: [],
};

// SR-033 (v7.2): visual before/after model comparison.
// Diff overlays are placed on the side where each affected state still
// exists: removed → current (left), added → proposed (right), changed
// → both sides.
//
// Both SVGs are fetched fresh from PlantUML Server, keyed on their
// source strings. This guarantees that (svg, model) pairs used for
// coordinate extraction came from the same render, so the overlay
// rectangles always land on the right state boxes.

interface ProposalViewProps {
  currentSource: string;
  suggestedSource: string;
  isApplied: boolean;
  onApply: () => void;
}

type ProposalState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      currentSvg: string | null;
      proposedSvg: string;
      diff: ModelDiff;
      beforeCoords: CoordinateMap;
      afterCoords: CoordinateMap;
      afterModel: StateMachineModel;
    };

export const COLOR_ADDED = '#16a34a';
export const COLOR_REMOVED = '#dc2626';
export const COLOR_CHANGED = '#f59e0b';

// Keep only diff entries that the user can actually see framed in the
// diagram. Initial/final pseudo-states have no label and compositions
// have no distinct frame in the current extractor, so including them
// in the count makes the summary disagree with the rendered rectangles.
function filterDiffToNormalStates(d: ModelDiff): ModelDiff {
  return {
    ...d,
    addedStates: d.addedStates.filter((s) => s.type === 'normal'),
    removedStates: d.removedStates.filter((s) => s.type === 'normal'),
    changedStates: d.changedStates.filter(
      (c) => c.after.type === 'normal' && c.before.type === 'normal'
    ),
  };
}

export function ProposalView({
  currentSource,
  suggestedSource,
  isApplied,
  onApply,
}: ProposalViewProps) {
  const [state, setState] = useState<ProposalState>({ kind: 'loading' });
  const [rawExpanded, setRawExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const modelTypeId = useSessionStore((s) => s.modelTypeId);
  const def = useMemo(
    () => getModelTypeDefinition(modelTypeId) ?? getDefaultModelTypeDefinition(),
    [modelTypeId]
  );

  const beforeModel = useMemo(() => def.parse(currentSource).model, [
    currentSource,
    def,
  ]);
  const afterParse = useMemo(() => def.parse(suggestedSource), [
    suggestedSource,
    def,
  ]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    if (!afterParse.model || afterParse.errors.length > 0) {
      const msg =
        afterParse.errors[0]?.message ?? 'Proposed source failed to parse';
      setState({ kind: 'error', message: msg });
      return;
    }

    const beforeNonEmpty =
      currentSource.trim() !== '' && beforeModel !== null;

    Promise.all([
      fetchSvg(suggestedSource),
      beforeNonEmpty
        ? fetchSvg(currentSource).catch(() => null)
        : Promise.resolve<SvgFetchResult | null>(null),
    ])
      .then(([proposedResult, beforeResult]) => {
        if (cancelled || !afterParse.model) return;
        if (proposedResult.errorMessage !== null) {
          setState({ kind: 'error', message: proposedResult.errorMessage });
          return;
        }
        const proposedSvg = proposedResult.svg;
        // Treat a 400 on the BEFORE source the same as a fetch failure:
        // if PlantUML rejects current, the proposal still has value
        // (it might be the AI's attempt to fix the broken state). Show
        // the proposed side only.
        const beforeSvg =
          beforeResult && beforeResult.errorMessage === null
            ? beforeResult.svg
            : null;
        // Coordinate extraction and the colored overlay are both
        // state-machine-specific today. For other model types we
        // still show the side-by-side SVGs but skip the diff overlay
        // (Step 6 — ModelTypeDefinition.diff is undefined for them).
        const isStateMachine = modelTypeId === 'state-machine';
        const afterModelSM = isStateMachine
          ? (afterParse.model as StateMachineModel)
          : null;
        const beforeModelSM = isStateMachine
          ? (beforeModel as StateMachineModel | null)
          : null;

        let afterCoords: CoordinateMap = new Map();
        let beforeCoords: CoordinateMap = new Map();
        let diff: ModelDiff = EMPTY_DIFF;

        if (isStateMachine && afterModelSM) {
          afterCoords = extractCoordinates(proposedSvg, afterModelSM);
          const safeBefore: StateMachineModel = beforeModelSM ?? {
            states: [],
            transitions: [],
            events: [],
          };
          beforeCoords =
            beforeSvg && beforeModelSM
              ? extractCoordinates(beforeSvg, beforeModelSM)
              : new Map();
          // SR-033 (v7.2): diff counts and overlay rectangles must agree.
          const rawDiff = def.diff
            ? (def.diff(safeBefore, afterModelSM) as ModelDiff)
            : EMPTY_DIFF;
          diff = filterDiffToNormalStates(rawDiff);
        }

        setState({
          kind: 'ready',
          currentSvg: beforeSvg,
          proposedSvg,
          diff,
          beforeCoords,
          afterCoords,
          afterModel: (afterModelSM as StateMachineModel) ?? {
            states: [],
            transitions: [],
            events: [],
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Render failed',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [suggestedSource, currentSource, beforeModel, afterParse, def, modelTypeId]);

  const diffEmpty = state.kind === 'ready' && isDiffEmpty(state.diff);

  return (
    <div className="border-t border-gray-200 bg-gray-50 rounded-b-lg">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Proposal — current vs. proposed
          {diffEmpty && ' — no changes'}
        </span>
        <div className="flex items-center gap-1.5">
          {state.kind === 'ready' && (
            <button
              onClick={() => setModalOpen(true)}
              className="px-2 py-0.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
              title="Open a larger side-by-side comparison"
            >
              ⛶ Open larger comparison
            </button>
          )}
          {isApplied ? (
            <span className="text-xs text-green-600 font-medium">
              ✓ Applied
            </span>
          ) : (
            !diffEmpty && (
              <button
                onClick={onApply}
                className="px-2 py-0.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700"
                disabled={state.kind !== 'ready'}
              >
                Apply
              </button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-2 pb-2">
        <CurrentCell state={state} />
        <ProposedCell state={state} />
      </div>

      {state.kind === 'ready' && !diffEmpty && (
        <div className="px-3 pb-2 text-[11px] text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
          <Legend color={COLOR_ADDED} label={`Added ${state.diff.addedStates.length}`} />
          <Legend color={COLOR_REMOVED} label={`Removed ${state.diff.removedStates.length}`} />
          <Legend color={COLOR_CHANGED} label={`Changed ${state.diff.changedStates.length}`} />
          <span className="text-gray-400">
            +{state.diff.addedTransitions.length} / −
            {state.diff.removedTransitions.length} / ~
            {state.diff.changedTransitions.length} transitions
          </span>
        </div>
      )}

      <div className="border-t border-gray-200">
        <button
          onClick={() => setRawExpanded((v) => !v)}
          className="w-full px-3 py-1 text-left text-xs text-gray-500 hover:bg-gray-100"
        >
          {rawExpanded ? '▼' : '▶'} Show raw PlantUML
        </button>
        {rawExpanded && (
          <pre className="px-3 py-2 text-xs text-gray-600 overflow-auto max-h-40 border-t border-gray-200 bg-white">
            {suggestedSource}
          </pre>
        )}
      </div>

      {modalOpen && state.kind === 'ready' && (
        <ProposalModal
          currentSvg={state.currentSvg}
          proposedSvg={state.proposedSvg}
          diff={state.diff}
          beforeCoords={state.beforeCoords}
          afterCoords={state.afterCoords}
          isApplied={isApplied}
          onApply={onApply}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function CurrentCell({ state }: { state: ProposalState }) {
  return (
    <div className="border border-gray-200 rounded bg-white overflow-hidden">
      <div className="px-2 py-0.5 text-[10px] text-gray-500 border-b border-gray-200">
        Current
      </div>
      <div className="h-40 overflow-auto bg-gray-50 p-2">
        <div className="flex flex-col items-center justify-center min-w-max min-h-full mx-auto">
          {state.kind === 'loading' ? (
            <span className="text-xs text-gray-400">Rendering…</span>
          ) : state.kind === 'ready' && state.currentSvg ? (
            <SvgWithOverlay
              svg={state.currentSvg}
              rects={buildBeforeOverlay(state.diff, state.beforeCoords)}
            />
          ) : (
            <span className="text-xs text-gray-400">empty</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProposedCell({ state }: { state: ProposalState }) {
  if (state.kind === 'loading') {
    return (
      <div className="border border-gray-200 rounded bg-white h-[184px] flex items-center justify-center text-xs text-gray-400">
        Rendering proposal…
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="border border-red-200 rounded bg-red-50 h-[184px] p-2 text-xs text-red-600 overflow-auto">
        Proposal could not be rendered:
        <br />
        {state.message}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded bg-white overflow-hidden">
      <div className="px-2 py-0.5 text-[10px] text-gray-500 border-b border-gray-200">
        Proposed
      </div>
      <div className="h-40 overflow-auto bg-gray-50 p-2">
        <div className="flex flex-col items-center justify-center min-w-max min-h-full mx-auto relative">
          <SvgWithOverlay
            svg={state.proposedSvg}
            rects={buildAfterOverlay(state.diff, state.afterCoords)}
          />
        </div>
      </div>
    </div>
  );
}

interface OverlayRect {
  id: string;
  color: string;
  rect: { x: number; y: number; width: number; height: number };
}

export function buildBeforeOverlay(
  diff: ModelDiff,
  coords: CoordinateMap
): OverlayRect[] {
  const out: OverlayRect[] = [];
  for (const s of diff.removedStates) {
    const c = coords.get(s.id);
    if (c) out.push({ id: s.id, color: COLOR_REMOVED, rect: c });
  }
  for (const s of diff.changedStates) {
    const c = coords.get(s.before.id);
    if (c) out.push({ id: s.before.id, color: COLOR_CHANGED, rect: c });
  }
  return out;
}

export function buildAfterOverlay(
  diff: ModelDiff,
  coords: CoordinateMap
): OverlayRect[] {
  const out: OverlayRect[] = [];
  for (const s of diff.addedStates) {
    const c = coords.get(s.id);
    if (c) out.push({ id: s.id, color: COLOR_ADDED, rect: c });
  }
  for (const s of diff.changedStates) {
    const c = coords.get(s.after.id);
    if (c) out.push({ id: s.after.id, color: COLOR_CHANGED, rect: c });
  }
  return out;
}

function SvgWithOverlay({
  svg,
  rects,
}: {
  svg: string;
  rects: OverlayRect[];
}) {
  const dims = useMemo(() => readSvgDimensions(svg), [svg]);
  if (!dims) {
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  // Lock the container to the viewBox aspect ratio so that BOTH the inner
  // PlantUML SVG and our overlay SVG render into the same viewport with
  // the same scale factor. Without this, letterboxing differences from
  // preserveAspectRatio caused the overlay rectangles to appear at a
  // slightly different scale than the underlying states (upper rect
  // shifted down, lower rect shifted up).
  const vbParts = dims.viewBox.split(/\s+/).map(parseFloat);
  const vbW = vbParts[2] ?? 0;
  const vbH = vbParts[3] ?? 0;
  const aspectRatio = vbW > 0 && vbH > 0 ? `${vbW} / ${vbH}` : undefined;

  return (
    <div
      className="relative block"
      style={{
        aspectRatio,
        width: vbW > 0 ? `${vbW}px` : undefined,
        maxWidth: '100%',
        maxHeight: '100%',
      }}
    >
      <div
        // `!` prefix forces !important so PlantUML's inline
        // `style="width:NNNpx"` on the <svg> root cannot override our
        // fill-the-container sizing. Without this, the underlying SVG
        // stays at its native pixel size while the overlay stretches
        // to the container, yielding a scale mismatch.
        className="absolute inset-0 [&>svg]:!block [&>svg]:!w-full [&>svg]:!h-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {rects.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={dims.viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          {rects.map(({ id, color, rect }) => (
            <rect
              key={`${id}-${color}`}
              x={rect.x - 3}
              y={rect.y - 3}
              width={rect.width + 6}
              height={rect.height + 6}
              fill="none"
              stroke={color}
              strokeWidth={3}
              rx={6}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

function readSvgDimensions(
  svg: string
): { viewBox: string; width: string; height: string } | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg') return null;
  const width = root.getAttribute('width') ?? '';
  const height = root.getAttribute('height') ?? '';
  // Prefer the explicit viewBox; if PlantUML omitted it, synthesize
  // one from the width / height attrs so the overlay can still be
  // placed. Without this fallback we returned null and the diff
  // rectangles didn't render at all.
  let viewBox = root.getAttribute('viewBox');
  if (!viewBox) {
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    viewBox = `0 0 ${w} ${h}`;
  }
  return { viewBox, width, height };
}
