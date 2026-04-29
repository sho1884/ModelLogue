import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import type { ModelDiff } from '../../modelTypes/state-machine/diff';
import type { CoordinateMap } from '../../engines/svgCoordinateExtractor';
import { isDiffEmpty } from '../../modelTypes/state-machine/diff';
import {
  buildBeforeOverlay,
  buildAfterOverlay,
  COLOR_ADDED,
  COLOR_REMOVED,
  COLOR_CHANGED,
} from './ProposalView';

// SR-033 (v7.2): full-screen modal expanding the proposal comparison.
// Each side has independent pan/zoom. Diff overlays appear on the side
// where each affected state still exists (removed → current, added →
// proposed, changed → both). Markers are NOT rendered here — the
// comparison focuses on the structural diff.

interface ProposalModalProps {
  currentSvg: string | null;
  proposedSvg: string;
  diff: ModelDiff;
  beforeCoords: CoordinateMap;
  afterCoords: CoordinateMap;
  isApplied: boolean;
  onApply: () => void;
  onClose: () => void;
}

export function ProposalModal({
  currentSvg,
  proposedSvg,
  diff,
  beforeCoords,
  afterCoords,
  isApplied,
  onApply,
  onClose,
}: ProposalModalProps) {
  const diffEmpty = isDiffEmpty(diff);

  // ESC closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
      onMouseDown={handleBackdropClick}
    >
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col"
        style={{ width: '92vw', height: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800">
              Compare — current vs. proposed
            </h2>
            {diffEmpty && (
              <span className="text-xs text-gray-500">no changes</span>
            )}
            {!diffEmpty && <DiffSummary diff={diff} />}
          </div>
          <div className="flex items-center gap-2">
            {isApplied ? (
              <span className="text-sm text-green-600 font-medium">
                ✓ Applied
              </span>
            ) : (
              !diffEmpty && (
                <button
                  onClick={() => {
                    onApply();
                    onClose();
                  }}
                  className="px-3 py-1 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700"
                >
                  Apply
                </button>
              )
            )}
            <button
              onClick={onClose}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              title="Close (ESC)"
            >
              Close
            </button>
          </div>
        </div>

        {/* Split body */}
        <div className="flex-1 grid grid-cols-2 gap-0 min-h-0">
          <DiagramPane
            label="Current"
            svg={currentSvg}
            rects={buildBeforeOverlay(diff, beforeCoords)}
          />
          <DiagramPane
            label="Proposed"
            svg={proposedSvg}
            rects={buildAfterOverlay(diff, afterCoords)}
          />
        </div>
      </div>
    </div>
  );
}

function DiffSummary({ diff }: { diff: ModelDiff }) {
  return (
    <span className="text-xs text-gray-600 flex flex-wrap gap-x-3">
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ backgroundColor: COLOR_ADDED }}
        />
        +{diff.addedStates.length}
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ backgroundColor: COLOR_REMOVED }}
        />
        −{diff.removedStates.length}
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ backgroundColor: COLOR_CHANGED }}
        />
        ~{diff.changedStates.length} states
      </span>
      <span className="text-gray-500">
        +{diff.addedTransitions.length} / −{diff.removedTransitions.length}
        {' / '}~{diff.changedTransitions.length} transitions
      </span>
    </span>
  );
}

interface OverlayRect {
  id: string;
  color: string;
  rect: { x: number; y: number; width: number; height: number };
}

// One wheel notch = one fixed zoom step. Without this the smooth-scroll
// devices (most trackpads, hi-res mice) emit dozens of events per notch
// and the comparison view zooms uncontrollably. Same pattern as
// DiagramView's wheel handling.
const ZOOM_STEP = 0.2;

function DiagramPane({
  label,
  svg,
  rects,
}: {
  label: string;
  svg: string | null;
  rects: OverlayRect[];
}) {
  const svgDims = useMemo(() => (svg ? readSvgDimensions(svg) : null), [svg]);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const t = transformRef.current;
      if (!t) return;
      e.preventDefault();
      if (e.deltaY < 0) t.zoomIn(ZOOM_STEP);
      else if (e.deltaY > 0) t.zoomOut(ZOOM_STEP);
    },
    []
  );

  return (
    <div className="flex flex-col min-h-0 border-r border-gray-200 last:border-r-0">
      <div className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 border-b border-gray-200 shrink-0">
        {label}
      </div>
      <div
        className="flex-1 relative overflow-hidden bg-white"
        onWheel={handleWheel}
      >
        {!svg || !svgDims ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            {svg ? 'Unable to render' : 'empty'}
          </div>
        ) : (
          <TransformWrapper
            ref={transformRef}
            minScale={0.1}
            maxScale={8}
            initialScale={1}
            centerOnInit
            limitToBounds={false}
            doubleClick={{ mode: 'reset' }}
            wheel={{ disabled: true }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <TransformComponent
                  wrapperClass="!w-full !h-full"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  {(() => {
                    // Derive container width and aspect from the viewBox
                    // so the overlay and PlantUML SVG render into the
                    // same viewport at the same scale (no preserveAspect
                    // offset regardless of the pane's aspect).
                    const p = svgDims.viewBox
                      .split(/\s+/)
                      .map(parseFloat);
                    const vbW = p[2] ?? 0;
                    const vbH = p[3] ?? 0;
                    const aspectRatio =
                      vbW > 0 && vbH > 0 ? `${vbW} / ${vbH}` : undefined;
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
                          // `!` forces !important so PlantUML's inline
                          // style on the <svg> root cannot override
                          // our fill-the-container sizing.
                          className="absolute inset-0 [&>svg]:!block [&>svg]:!w-full [&>svg]:!h-full"
                          dangerouslySetInnerHTML={{ __html: svg }}
                        />
                        {rects.length > 0 && (
                          <svg
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            viewBox={svgDims.viewBox}
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
                  })()}
                </TransformComponent>
                <div className="absolute bottom-3 right-3 flex flex-col bg-white border border-gray-300 rounded shadow-sm">
                  <button
                    onClick={() => zoomIn(0.2)}
                    title="Zoom in"
                    className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    +
                  </button>
                  <button
                    onClick={() => zoomOut(0.2)}
                    title="Zoom out"
                    className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-200"
                  >
                    −
                  </button>
                  <button
                    onClick={() => resetTransform()}
                    title="Fit"
                    className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 border-t border-gray-200"
                  >
                    Fit
                  </button>
                </div>
              </>
            )}
          </TransformWrapper>
        )}
      </div>
    </div>
  );
}

function readSvgDimensions(
  svg: string
): { viewBox: string; pxWidth: number; pxHeight: number } | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'svg') return null;
  const w = parseFloat(root.getAttribute('width') ?? '');
  const h = parseFloat(root.getAttribute('height') ?? '');
  // Prefer the explicit viewBox; if PlantUML omitted it, synthesize
  // one from the width / height attrs so the overlay can still render.
  let viewBox = root.getAttribute('viewBox');
  if (!viewBox) {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    viewBox = `0 0 ${w} ${h}`;
  }
  let pxWidth = Number.isFinite(w) && w > 0 ? w : 0;
  let pxHeight = Number.isFinite(h) && h > 0 ? h : 0;
  if (!pxWidth || !pxHeight) {
    const parts = viewBox.split(/\s+/).map(parseFloat);
    if (parts.length === 4) {
      pxWidth = pxWidth || parts[2];
      pxHeight = pxHeight || parts[3];
    }
  }
  return { viewBox, pxWidth, pxHeight };
}
