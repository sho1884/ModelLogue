// Render a single marker as SVG. Used by MarkerOverlay.
// The marker is selectable: clicking it sets selectedMarkerId.

import type { Marker } from '../../types/marker';
import { MARKER_STROKE_COLOR } from '../../types/marker';

interface MarkerShapeProps {
  marker: Marker;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const STROKE_WIDTH = 3;
const SELECTED_DASH = '6 4';

export function MarkerShape({
  marker,
  isSelected,
  onPointerDown,
  onContextMenu,
}: MarkerShapeProps) {
  const stroke = MARKER_STROKE_COLOR[marker.color];
  const common = {
    stroke,
    strokeWidth: STROKE_WIDTH,
    fill: 'none',
    style: { cursor: 'move' as const },
    onPointerDown,
    onContextMenu,
  };

  const selectedRing =
    isSelected && marker.geometry.type !== 'arrow' ? (
      <SelectedHalo geometry={marker.geometry} />
    ) : null;

  switch (marker.geometry.type) {
    case 'ellipse':
      return (
        <g>
          {selectedRing}
          <ellipse
            cx={marker.geometry.cx}
            cy={marker.geometry.cy}
            rx={marker.geometry.rx}
            ry={marker.geometry.ry}
            {...common}
          />
        </g>
      );
    case 'rectangle':
      return (
        <g>
          {selectedRing}
          <rect
            x={marker.geometry.x}
            y={marker.geometry.y}
            width={marker.geometry.width}
            height={marker.geometry.height}
            {...common}
          />
        </g>
      );
    case 'arrow': {
      const { x1, y1, x2, y2 } = marker.geometry;
      // Compute a small triangle at the head.
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLength = 14;
      const headAngle = Math.PI / 6;
      const hx1 = x2 - headLength * Math.cos(angle - headAngle);
      const hy1 = y2 - headLength * Math.sin(angle - headAngle);
      const hx2 = x2 - headLength * Math.cos(angle + headAngle);
      const hy2 = y2 - headLength * Math.sin(angle + headAngle);
      return (
        <g>
          <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
          <polygon
            points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`}
            stroke={stroke}
            strokeWidth={STROKE_WIDTH}
            fill={stroke}
            style={{ cursor: 'move' }}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
          />
          {isSelected && (
            <>
              <circle
                cx={x1}
                cy={y1}
                r={5}
                fill="#fff"
                stroke={stroke}
                strokeWidth={2}
              />
              <circle
                cx={x2}
                cy={y2}
                r={5}
                fill="#fff"
                stroke={stroke}
                strokeWidth={2}
              />
            </>
          )}
        </g>
      );
    }
  }
}

function SelectedHalo({
  geometry,
}: {
  geometry: Marker['geometry'];
}) {
  if (geometry.type === 'ellipse') {
    return (
      <ellipse
        cx={geometry.cx}
        cy={geometry.cy}
        rx={geometry.rx + 4}
        ry={geometry.ry + 4}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.5}
        strokeDasharray={SELECTED_DASH}
      />
    );
  }
  if (geometry.type === 'rectangle') {
    return (
      <rect
        x={geometry.x - 4}
        y={geometry.y - 4}
        width={geometry.width + 8}
        height={geometry.height + 8}
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.5}
        strokeDasharray={SELECTED_DASH}
      />
    );
  }
  return null;
}
