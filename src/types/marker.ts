// Review marker types

export type MarkerColor = 'red' | 'blue' | 'green' | 'purple';
export type MarkerType = 'ellipse' | 'rectangle' | 'arrow';

// Tools available on the diagram toolbar.
// 'select' is for selecting / moving / resizing existing markers.
// 'pan' lets the user drag the canvas around.
// The marker shape tools create a new marker by drag.
export type DiagramTool = MarkerType | 'select' | 'pan';

export const MARKER_PALETTE: MarkerColor[] = [
  'red',
  'blue',
  'green',
  'purple',
];

// Vivid stroke colors used on the diagram canvas.
export const MARKER_STROKE_COLOR: Record<MarkerColor, string> = {
  red: '#e03131',
  blue: '#1971c2',
  green: '#2f9e44',
  purple: '#9c36b5',
};

export interface EllipseGeometry {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RectangleGeometry {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowGeometry {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type MarkerGeometry =
  | EllipseGeometry
  | RectangleGeometry
  | ArrowGeometry;

export interface Marker {
  id: string;
  color: MarkerColor;
  geometry: MarkerGeometry;
}

// v7.5: auto-placed markers drawn by the apply pipeline on
// requirement-diagram sessions. Distinct from user markers:
// - colors are fixed per kind (added=green, changed=amber) so the
//   semantics match the ProposalView overlay in state-machine sessions;
// - cleared on each source change and re-placed after an AI apply (per
//   user direction — "図を更新したら消していい、新たに枠を描く");
// - not selectable / not in the 4-color palette, so they don't interfere
//   with the user's manual markers.
export type AutoMarkerKind = 'added' | 'changed';

export const AUTO_MARKER_STROKE: Record<AutoMarkerKind, string> = {
  added: '#16a34a', // green-600 — matches COLOR_ADDED in ProposalView
  changed: '#f59e0b', // amber-500 — matches COLOR_CHANGED in ProposalView
};

export interface AutoMarker {
  id: string;
  kind: AutoMarkerKind;
  // The diagram-coordinate rectangle tracing the element's bounding box.
  rect: { x: number; y: number; width: number; height: number };
  // The model-element this marker annotates (requirement id today).
  elementId: string;
}
