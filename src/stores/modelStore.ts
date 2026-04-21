import { create } from 'zustand';
import type { StateMachineModel } from '../types/stateMachine';
import type { MatrixData } from '../types/matrix';
import type { ParseError } from '../types/parser';
import type { CoordinateMap } from '../engines/svgCoordinateExtractor';
import { parse } from '../parsers/stateMachineParser';
import {
  generateStateEventMatrix,
  generateStateStateMatrix,
} from '../engines/matrixGenerator';
import { fetchSvg } from '../services/plantUmlService';
import { extractCoordinates } from '../engines/svgCoordinateExtractor';
import { useSessionStore } from './sessionStore';

interface ModelStore {
  model: StateMachineModel | null;
  parseErrors: ParseError[];
  stateEventMatrix: MatrixData | null;
  stateStateMatrix: MatrixData | null;
  coordinates: CoordinateMap | null;
  svgString: string | null;
  svgFetchError: string | null;

  parseSource: (source: string) => void;
  fetchCoordinates: (source: string) => Promise<void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  model: null,
  parseErrors: [],
  stateEventMatrix: null,
  stateStateMatrix: null,
  coordinates: null,
  svgString: null,
  svgFetchError: null,

  parseSource: (source: string) => {
    const result = parse(source);

    if (result.model) {
      set({
        model: result.model,
        parseErrors: result.errors,
        stateEventMatrix: generateStateEventMatrix(result.model),
        stateStateMatrix: generateStateStateMatrix(result.model),
      });
      // SR-001 (v7.2): the moment a non-trivial parseable model exists,
      // the session moves out of SEED phase. One-way transition.
      // We require >=1 real state — the parser also returns an empty
      // model object for empty / whitespace-only input, and that
      // emptiness must NOT be treated as "model established" or the
      // editor would lock at session start.
      if (result.model.states.length > 0) {
        useSessionStore.getState().markModelEstablished();
      }
    } else {
      set({ parseErrors: result.errors });
    }
  },

  fetchCoordinates: async (source: string) => {
    const model = get().model;
    if (!model) return;

    try {
      const svgString = await fetchSvg(source);
      const coords = extractCoordinates(svgString, model);
      set({ coordinates: coords, svgString, svgFetchError: null });
    } catch (e) {
      set({
        svgFetchError: e instanceof Error ? e.message : 'SVG fetch failed',
      });
    }
  },
}));
