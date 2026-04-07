import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { useModelStore } from '../../stores/modelStore';
import { useMarkerStore } from '../../stores/markerStore';
import { MarkerToolbar } from './MarkerToolbar';
import { MarkerShape } from './MarkerShape';
import type {
  Marker,
  MarkerGeometry,
  MarkerType,
} from '../../types/marker';

interface SvgInfo {
  url: string;
  width: number;
  height: number;
}

interface DragState {
  mode: 'create' | 'move' | 'resize-handle' | 'arrow-endpoint';
  startSvgX: number;
  startSvgY: number;
  // For move/resize/arrow modes:
  markerId?: string;
  originalGeometry?: MarkerGeometry;
  handle?: 'nw' | 'ne' | 'sw' | 'se' | 'a1' | 'a2';
}

const HANDLE_SIZE = 8;

export function DiagramView() {
  const svgString = useModelStore((s) => s.svgString);
  const [svgInfo, setSvgInfo] = useState<SvgInfo | null>(null);

  // Build a Blob URL for the SVG so we can render it via <img> safely.
  useEffect(() => {
    if (!svgString) {
      setSvgInfo(null);
      return;
    }
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    const width = parseFloat(svgEl?.getAttribute('width') ?? '400');
    const height = parseFloat(svgEl?.getAttribute('height') ?? '300');

    setSvgInfo({ url, width, height });
    return () => URL.revokeObjectURL(url);
  }, [svgString]);

  return (
    <div className="flex-1 flex flex-col bg-white" style={{ minHeight: 0 }}>
      <MarkerToolbar />
      <div className="flex-1 relative overflow-hidden">
        {svgInfo ? (
          <DiagramCanvas svgInfo={svgInfo} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Waiting for PlantUML Server...
          </div>
        )}
      </div>
      <Toast />
    </div>
  );
}

// Padding around the PlantUML SVG so users have room to draw markers
// outside the diagram itself.
const CANVAS_PADDING = 250;

function DiagramCanvas({ svgInfo }: { svgInfo: SvgInfo }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const activeTool = useMarkerStore((s) => s.activeTool);
  const markers = useMarkerStore((s) => s.markers);
  const addMarker = useMarkerStore((s) => s.addMarker);
  const updateMarker = useMarkerStore((s) => s.updateMarker);
  const deleteMarker = useMarkerStore((s) => s.deleteMarker);
  const selectedMarkerId = useMarkerStore((s) => s.selectedMarkerId);
  const selectMarker = useMarkerStore((s) => s.selectMarker);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragGeometry, setDragGeometry] = useState<MarkerGeometry | null>(
    null
  );

  // Total canvas size includes padding around the SVG image.
  const canvasWidth = svgInfo.width + CANVAS_PADDING * 2;
  const canvasHeight = svgInfo.height + CANVAS_PADDING * 2;

  // Convert client (mouse) coordinates to SVG coordinates.
  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const result = pt.matrixTransform(inv);
    return { x: result.x, y: result.y };
  }, []);

  // Background pointerdown — start a new marker draw.
  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Ignore right-click; let the browser context menu show on markers.
      if (e.button !== 0) return;
      // In pan mode, the overlay does not handle pointer events at all.
      if (activeTool === 'pan') return;
      // In select mode, clicking the background just deselects.
      if (activeTool === 'select') {
        if (e.target === e.currentTarget) selectMarker(null);
        return;
      }
      // Only start drawing on the background, not on a marker.
      if (e.target !== e.currentTarget) return;

      const tool: MarkerType = activeTool;
      const { x, y } = toSvgPoint(e.clientX, e.clientY);
      selectMarker(null);
      setDrag({
        mode: 'create',
        startSvgX: x,
        startSvgY: y,
      });
      setDragGeometry(buildInitialGeometry(tool, x, y));
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    },
    [activeTool, selectMarker, toSvgPoint]
  );

  // Pointermove on the SVG — update drag state.
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      const { x, y } = toSvgPoint(e.clientX, e.clientY);

      if (drag.mode === 'create') {
        if (activeTool === 'pan' || activeTool === 'select') return;
        setDragGeometry(
          buildGeometryFromDrag(activeTool, drag.startSvgX, drag.startSvgY, x, y)
        );
      } else if (
        drag.mode === 'move' &&
        drag.markerId &&
        drag.originalGeometry
      ) {
        const dx = x - drag.startSvgX;
        const dy = y - drag.startSvgY;
        const next = translateGeometry(drag.originalGeometry, dx, dy);
        updateMarker(drag.markerId, next);
      } else if (
        drag.mode === 'resize-handle' &&
        drag.markerId &&
        drag.originalGeometry &&
        drag.handle
      ) {
        const next = resizeGeometry(
          drag.originalGeometry,
          drag.handle,
          x,
          y
        );
        if (next) updateMarker(drag.markerId, next);
      } else if (
        drag.mode === 'arrow-endpoint' &&
        drag.markerId &&
        drag.originalGeometry &&
        (drag.handle === 'a1' || drag.handle === 'a2')
      ) {
        if (drag.originalGeometry.type === 'arrow') {
          const next: MarkerGeometry = { ...drag.originalGeometry };
          if (drag.handle === 'a1') {
            next.x1 = x;
            next.y1 = y;
          } else {
            next.x2 = x;
            next.y2 = y;
          }
          updateMarker(drag.markerId, next);
        }
      }
    },
    [drag, activeTool, toSvgPoint, updateMarker]
  );

  // Pointerup — finalize.
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      if (drag.mode === 'create' && dragGeometry) {
        // Only create if the drag is large enough.
        if (geometryIsLargeEnough(dragGeometry)) {
          addMarker(dragGeometry);
        }
      }
      setDrag(null);
      setDragGeometry(null);
      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [drag, dragGeometry, addMarker]
  );

  // Marker click — select.
  const handleMarkerPointerDown = useCallback(
    (marker: Marker) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      selectMarker(marker.id);
      const { x, y } = toSvgPoint(e.clientX, e.clientY);
      setDrag({
        mode: 'move',
        startSvgX: x,
        startSvgY: y,
        markerId: marker.id,
        originalGeometry: marker.geometry,
      });
      const target = e.currentTarget as SVGElement;
      const owner = target.ownerSVGElement;
      if (owner) owner.setPointerCapture(e.pointerId);
    },
    [selectMarker, toSvgPoint]
  );

  // Right-click marker — show context menu.
  const handleMarkerContextMenu = useCallback(
    (marker: Marker) => (e: React.MouseEvent) => {
      e.preventDefault();
      // Simple confirm-based menu for now.
      selectMarker(marker.id);
      if (window.confirm('Delete this marker?')) {
        deleteMarker(marker.id);
      }
    },
    [deleteMarker, selectMarker]
  );

  // Keyboard delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId) {
        // Avoid deleting markers when the user is typing in an input/editor.
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            target.closest('.cm-editor'))
        ) {
          return;
        }
        e.preventDefault();
        deleteMarker(selectedMarkerId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMarkerId, deleteMarker]);

  // Resize handles for the selected marker (ellipse / rectangle / arrow).
  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId) ?? null,
    [markers, selectedMarkerId]
  );

  const handleHandlePointerDown = useCallback(
    (handle: DragState['handle']) =>
      (e: React.PointerEvent) => {
        if (e.button !== 0 || !selectedMarker) return;
        e.stopPropagation();
        const { x, y } = toSvgPoint(e.clientX, e.clientY);
        const isArrowEndpoint = handle === 'a1' || handle === 'a2';
        setDrag({
          mode: isArrowEndpoint ? 'arrow-endpoint' : 'resize-handle',
          startSvgX: x,
          startSvgY: y,
          markerId: selectedMarker.id,
          originalGeometry: selectedMarker.geometry,
          handle,
        });
        const target = e.currentTarget as SVGElement;
        const owner = target.ownerSVGElement;
        if (owner) owner.setPointerCapture(e.pointerId);
      },
    [selectedMarker, toSvgPoint]
  );

  // Track wrapper size so we can compute the initial centered position.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperSize, setWrapperSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () =>
      setWrapperSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Center the canvas in the wrapper at scale 1.
  const initialPositionX = wrapperSize
    ? (wrapperSize.w - canvasWidth) / 2
    : 0;
  const initialPositionY = wrapperSize
    ? (wrapperSize.h - canvasHeight) / 2
    : 0;

  const isPanMode = activeTool === 'pan';

  // We disable react-zoom-pan-pinch's wheel zoom and handle the wheel
  // ourselves so that one notch = one fixed zoom step. Without this,
  // some pointing devices (especially smooth-scroll trackpads) generate
  // many events per notch and cause runaway zooming.
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const t = transformRef.current;
      if (!t) return;
      e.preventDefault();
      const ZOOM_STEP = 0.2;
      if (e.deltaY < 0) {
        t.zoomIn(ZOOM_STEP);
      } else if (e.deltaY > 0) {
        t.zoomOut(ZOOM_STEP);
      }
    },
    []
  );

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0"
      onWheel={handleWheel}
    >
      {wrapperSize && (
        <TransformWrapper
          ref={transformRef}
          minScale={0.1}
          maxScale={5}
          initialScale={1}
          initialPositionX={initialPositionX}
          initialPositionY={initialPositionY}
          limitToBounds={false}
          doubleClick={{ disabled: true }}
          wheel={{ disabled: true }}
          panning={{ disabled: !isPanMode }}
        >
          {({ resetTransform, zoomIn, zoomOut, setTransform }) => (
            <>
              <TransformComponent
                wrapperClass="!w-full !h-full"
                contentClass="!w-full !h-full"
              >
                <div
                  className="relative bg-white border border-dashed border-gray-300"
                  style={{ width: canvasWidth, height: canvasHeight }}
                >
                  <img
                    src={svgInfo.url}
                    alt="PlantUML diagram"
                    width={svgInfo.width}
                    height={svgInfo.height}
                    draggable={false}
                    style={{
                      display: 'block',
                      userSelect: 'none',
                      position: 'absolute',
                      left: CANVAS_PADDING,
                      top: CANVAS_PADDING,
                    }}
                  />
                  <svg
                    ref={svgRef}
                    className="svg-overlay"
                    xmlns="http://www.w3.org/2000/svg"
                    width={canvasWidth}
                    height={canvasHeight}
                    viewBox={`${-CANVAS_PADDING} ${-CANVAS_PADDING} ${canvasWidth} ${canvasHeight}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      cursor:
                        activeTool === 'pan'
                          ? 'grab'
                          : activeTool === 'select'
                            ? 'default'
                            : 'crosshair',
                      // In pan mode, let pointer events fall through so the
                      // TransformWrapper can drag the canvas.
                      pointerEvents: isPanMode ? 'none' : 'auto',
                    }}
                    onPointerDown={handleBackgroundPointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {markers.map((marker) => (
                      <MarkerShape
                        key={marker.id}
                        marker={marker}
                        isSelected={marker.id === selectedMarkerId}
                        onPointerDown={handleMarkerPointerDown(marker)}
                        onContextMenu={handleMarkerContextMenu(marker)}
                      />
                    ))}
                    {/* Live preview while dragging to create */}
                    {drag?.mode === 'create' && dragGeometry && (
                      <PreviewShape geometry={dragGeometry} />
                    )}
                    {/* Resize/endpoint handles for the selected marker */}
                    {selectedMarker && (
                      <SelectionHandles
                        marker={selectedMarker}
                        onHandlePointerDown={handleHandlePointerDown}
                      />
                    )}
                  </svg>
                </div>
              </TransformComponent>
              <ZoomControls
                onZoomIn={() => zoomIn(0.2)}
                onZoomOut={() => zoomOut(0.2)}
                onResetZoom={() =>
                  setTransform(initialPositionX, initialPositionY, 1)
                }
                onHome={() => resetTransform()}
              />
            </>
          )}
        </TransformWrapper>
      )}
    </div>
  );
}

function ZoomControls({
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onHome,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onHome: () => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 flex flex-col gap-0 bg-white border border-gray-300 rounded shadow-sm">
      <button
        onClick={onZoomIn}
        title="Zoom in"
        className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
      >
        +
      </button>
      <button
        onClick={onZoomOut}
        title="Zoom out"
        className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-200"
      >
        −
      </button>
      <button
        onClick={onResetZoom}
        title="Reset zoom to 100%"
        className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 border-t border-gray-200"
      >
        100%
      </button>
      <button
        onClick={onHome}
        title="Home (recenter and reset zoom)"
        className="px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-200"
      >
        ⌂
      </button>
    </div>
  );
}

function PreviewShape({ geometry }: { geometry: MarkerGeometry }) {
  const stroke = '#9ca3af';
  const common = {
    stroke,
    strokeWidth: 2,
    strokeDasharray: '4 4',
    fill: 'none',
  };
  if (geometry.type === 'ellipse') {
    return (
      <ellipse
        cx={geometry.cx}
        cy={geometry.cy}
        rx={geometry.rx}
        ry={geometry.ry}
        {...common}
      />
    );
  }
  if (geometry.type === 'rectangle') {
    return (
      <rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        {...common}
      />
    );
  }
  return (
    <line
      x1={geometry.x1}
      y1={geometry.y1}
      x2={geometry.x2}
      y2={geometry.y2}
      {...common}
    />
  );
}

function SelectionHandles({
  marker,
  onHandlePointerDown,
}: {
  marker: Marker;
  onHandlePointerDown: (
    handle: DragState['handle']
  ) => (e: React.PointerEvent) => void;
}) {
  const g = marker.geometry;
  if (g.type === 'arrow') {
    return (
      <>
        <Handle
          x={g.x1}
          y={g.y1}
          onPointerDown={onHandlePointerDown('a1')}
        />
        <Handle
          x={g.x2}
          y={g.y2}
          onPointerDown={onHandlePointerDown('a2')}
        />
      </>
    );
  }
  let x = 0,
    y = 0,
    w = 0,
    h = 0;
  if (g.type === 'rectangle') {
    x = g.x;
    y = g.y;
    w = g.width;
    h = g.height;
  } else {
    x = g.cx - g.rx;
    y = g.cy - g.ry;
    w = g.rx * 2;
    h = g.ry * 2;
  }
  return (
    <>
      <Handle x={x} y={y} onPointerDown={onHandlePointerDown('nw')} />
      <Handle x={x + w} y={y} onPointerDown={onHandlePointerDown('ne')} />
      <Handle x={x} y={y + h} onPointerDown={onHandlePointerDown('sw')} />
      <Handle x={x + w} y={y + h} onPointerDown={onHandlePointerDown('se')} />
    </>
  );
}

function Handle({
  x,
  y,
  onPointerDown,
}: {
  x: number;
  y: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <rect
      x={x - HANDLE_SIZE / 2}
      y={y - HANDLE_SIZE / 2}
      width={HANDLE_SIZE}
      height={HANDLE_SIZE}
      fill="#fff"
      stroke="#2563eb"
      strokeWidth={1.5}
      style={{ cursor: 'nwse-resize' }}
      onPointerDown={onPointerDown}
    />
  );
}

function Toast() {
  const message = useMarkerStore((s) => s.toastMessage);
  const clear = useMarkerStore((s) => s.clearToast);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 4000);
    return () => clearTimeout(t);
  }, [message, clear]);
  if (!message) return null;
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-red-50 border border-red-200 rounded shadow text-sm text-red-700">
      {message}
    </div>
  );
}

// --- Geometry helpers ---

function buildInitialGeometry(
  type: MarkerType,
  x: number,
  y: number
): MarkerGeometry {
  if (type === 'ellipse') return { type: 'ellipse', cx: x, cy: y, rx: 0, ry: 0 };
  if (type === 'rectangle') return { type: 'rectangle', x, y, width: 0, height: 0 };
  return { type: 'arrow', x1: x, y1: y, x2: x, y2: y };
}

function buildGeometryFromDrag(
  type: MarkerType,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): MarkerGeometry {
  if (type === 'ellipse') {
    return {
      type: 'ellipse',
      cx: (startX + endX) / 2,
      cy: (startY + endY) / 2,
      rx: Math.abs(endX - startX) / 2,
      ry: Math.abs(endY - startY) / 2,
    };
  }
  if (type === 'rectangle') {
    return {
      type: 'rectangle',
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
    };
  }
  return { type: 'arrow', x1: startX, y1: startY, x2: endX, y2: endY };
}

function geometryIsLargeEnough(g: MarkerGeometry): boolean {
  if (g.type === 'ellipse') return g.rx > 4 && g.ry > 4;
  if (g.type === 'rectangle') return g.width > 8 && g.height > 8;
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  return Math.sqrt(dx * dx + dy * dy) > 8;
}

function translateGeometry(
  g: MarkerGeometry,
  dx: number,
  dy: number
): MarkerGeometry {
  if (g.type === 'ellipse') return { ...g, cx: g.cx + dx, cy: g.cy + dy };
  if (g.type === 'rectangle') return { ...g, x: g.x + dx, y: g.y + dy };
  return { ...g, x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy };
}

function resizeGeometry(
  original: MarkerGeometry,
  handle: NonNullable<DragState['handle']>,
  x: number,
  y: number
): MarkerGeometry | null {
  if (original.type === 'arrow') return null;

  let x1: number, y1: number, x2: number, y2: number;
  if (original.type === 'rectangle') {
    x1 = original.x;
    y1 = original.y;
    x2 = original.x + original.width;
    y2 = original.y + original.height;
  } else {
    x1 = original.cx - original.rx;
    y1 = original.cy - original.ry;
    x2 = original.cx + original.rx;
    y2 = original.cy + original.ry;
  }

  switch (handle) {
    case 'nw':
      x1 = x;
      y1 = y;
      break;
    case 'ne':
      x2 = x;
      y1 = y;
      break;
    case 'sw':
      x1 = x;
      y2 = y;
      break;
    case 'se':
      x2 = x;
      y2 = y;
      break;
    default:
      return null;
  }

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (original.type === 'rectangle') {
    return {
      type: 'rectangle',
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  return {
    type: 'ellipse',
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
  };
}
