import { create } from 'zustand';
import {
  type Marker,
  type MarkerColor,
  type MarkerGeometry,
  type DiagramTool,
  MARKER_PALETTE,
} from '../types/marker';

interface MarkerStore {
  markers: Marker[];
  activeTool: DiagramTool;
  selectedMarkerId: string | null;
  toastMessage: string | null;

  setActiveTool: (tool: DiagramTool) => void;
  // Returns the new marker, or null if all colors are in use.
  addMarker: (geometry: MarkerGeometry) => Marker | null;
  updateMarker: (id: string, geometry: MarkerGeometry) => void;
  deleteMarker: (id: string) => void;
  selectMarker: (id: string | null) => void;
  clearToast: () => void;
}

function pickAvailableColor(used: Set<MarkerColor>): MarkerColor | null {
  for (const c of MARKER_PALETTE) {
    if (!used.has(c)) return c;
  }
  return null;
}

export const useMarkerStore = create<MarkerStore>((set, get) => ({
  markers: [],
  // SR-012 (v7.1): pan is the default. At session start there are no
  // markers to select, so pan gives the user a useful first action
  // (drag the canvas) instead of an inert select mode.
  activeTool: 'pan',
  selectedMarkerId: null,
  toastMessage: null,

  setActiveTool: (tool) => set({ activeTool: tool }),

  addMarker: (geometry) => {
    const used = new Set<MarkerColor>(get().markers.map((m) => m.color));
    const color = pickAvailableColor(used);
    if (!color) {
      set({
        toastMessage:
          'All four marker colors are in use. Delete a marker to add a new one.',
      });
      return null;
    }
    const marker: Marker = {
      id: crypto.randomUUID(),
      color,
      geometry,
    };
    set({ markers: [...get().markers, marker] });
    return marker;
  },

  updateMarker: (id, geometry) => {
    set({
      markers: get().markers.map((m) =>
        m.id === id ? { ...m, geometry } : m
      ),
    });
  },

  deleteMarker: (id) => {
    const next = get().markers.filter((m) => m.id !== id);
    set({
      markers: next,
      selectedMarkerId:
        get().selectedMarkerId === id ? null : get().selectedMarkerId,
    });
  },

  selectMarker: (id) => set({ selectedMarkerId: id }),

  clearToast: () => set({ toastMessage: null }),
}));
