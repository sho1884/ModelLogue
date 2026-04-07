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
