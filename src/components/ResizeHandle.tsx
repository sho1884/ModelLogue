import { useCallback, useEffect, useRef } from 'react';

interface ResizeHandleProps {
  /**
   * Which edge this handle lives on. Determines the cursor, axis, and the
   * sign of the delta applied to the current value.
   */
  edge: 'top' | 'left';
  /** Current size (height for 'top' edge, width for 'left' edge). */
  value: number;
  /** Called with the new size during a drag. */
  onChange: (next: number) => void;
  /** Clamp bounds. */
  min: number;
  max: number;
}

/**
 * A thin draggable bar for resizing a panel.
 *
 * - `edge: 'top'`   — sits at the top edge of a panel whose height grows upward
 *                     (used by the analysis panel). Dragging up increases height.
 * - `edge: 'left'`  — sits at the left edge of a panel whose width grows leftward
 *                     (used by the chat panel). Dragging left increases width.
 *
 * The handle takes over the pointer during a drag so motion outside the bar
 * still updates the size. An overlay is mounted on document.body to keep the
 * cursor and to block text selection for the duration of the drag.
 */
export function ResizeHandle({
  edge,
  value,
  onChange,
  min,
  max,
}: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const startPosRef = useRef(0);
  const startValueRef = useRef(0);

  const cursor = edge === 'top' ? 'ns-resize' : 'ew-resize';

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      let next: number;
      if (edge === 'top') {
        // The bar is at the top of a panel that sits at the bottom of its
        // parent. Dragging the pointer upward (smaller clientY) should make
        // the panel taller.
        const delta = startPosRef.current - e.clientY;
        next = startValueRef.current + delta;
      } else {
        // The bar is at the left of a panel that sits at the right of its
        // parent. Dragging the pointer leftward (smaller clientX) should make
        // the panel wider.
        const delta = startPosRef.current - e.clientX;
        next = startValueRef.current + delta;
      }
      if (next < min) next = min;
      if (next > max) next = max;
      onChange(next);
    },
    [edge, min, max, onChange]
  );

  const stopDragging = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
    window.removeEventListener('pointercancel', stopDragging);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => stopDragging();
  }, [stopDragging]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      draggingRef.current = true;
      startPosRef.current = edge === 'top' ? e.clientY : e.clientX;
      startValueRef.current = value;
      document.body.style.cursor = cursor;
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopDragging);
      window.addEventListener('pointercancel', stopDragging);
    },
    [edge, value, cursor, handlePointerMove, stopDragging]
  );

  const style: React.CSSProperties =
    edge === 'top'
      ? {
          cursor,
          height: 6,
          width: '100%',
          flexShrink: 0,
        }
      : {
          cursor,
          width: 6,
          height: '100%',
          flexShrink: 0,
        };

  return (
    <div
      className="bg-gray-200 hover:bg-emerald-300 transition-colors"
      style={style}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={edge === 'top' ? 'horizontal' : 'vertical'}
    />
  );
}
