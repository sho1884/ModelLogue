import { create } from 'zustand';
import type { StateMachineModel } from '../types/stateMachine';
import type { MatrixData } from '../types/matrix';
import type { ParseError } from '../types/parser';
import type { CoordinateMap } from '../engines/svgCoordinateExtractor';
import {
  generateStateEventMatrix,
  generateStateStateMatrix,
} from '../engines/matrixGenerator';
import { fetchSvg } from '../services/plantUmlService';
import { useSessionStore } from './sessionStore';
import { getModelTypeDefinition } from '../modelTypes/registry';
import type { RequirementModel } from '../modelTypes/requirement/model';
import {
  insertHideMarker,
  markDeleted,
  removeHideMarker,
  unmarkDeleted,
} from '../modelTypes/requirement/sourceEdit';

// v7.5 step 5: `model` is typed as a union so stores and components
// can discriminate via sessionStore.modelTypeId. State-machine-specific
// derived state (the two matrices) stays null for non-state-machine
// sessions. Coordinates / SVG remain generic (any PlantUML source →
// coordinates extraction is safe for any diagram the Server can render).
export type ActiveModel = StateMachineModel | RequirementModel | null;

interface ModelStore {
  model: ActiveModel;
  parseErrors: ParseError[];
  stateEventMatrix: MatrixData | null;
  stateStateMatrix: MatrixData | null;
  coordinates: CoordinateMap | null;
  svgString: string | null;
  svgFetchError: string | null;

  parseSource: (source: string) => void;
  fetchCoordinates: (source: string) => Promise<void>;

  // ADR-014 review-state mutators (requirement model only). Applied
  // after parse, before Save. No-op when the active model is not a
  // RequirementModel.
  toggleRequirementHidden: (id: string) => void;
  markRequirementDeleted: (id: string, reason: string) => void;
  unmarkRequirementDeleted: (id: string) => void;
}

function isRequirementModel(m: ActiveModel): m is RequirementModel {
  return !!(m && 'requirements' in (m as object));
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
    const modelTypeId = useSessionStore.getState().modelTypeId;
    const def = getModelTypeDefinition(modelTypeId);
    if (!def) {
      set({ parseErrors: [] });
      return;
    }
    const result = def.parse(source);

    // Generate type-specific derived state.
    let stateEventMatrix: MatrixData | null = null;
    let stateStateMatrix: MatrixData | null = null;
    if (modelTypeId === 'state-machine' && isStateMachineModelOrNull(result.model)) {
      const sm = result.model;
      if (sm) {
        stateEventMatrix = generateStateEventMatrix(sm);
        stateStateMatrix = generateStateStateMatrix(sm);
      }
    }

    set({
      model: (result.model ?? null) as ActiveModel,
      parseErrors: result.errors,
      stateEventMatrix,
      stateStateMatrix,
    });

    // SR-001 (v7.2): a non-trivial parseable model flips SEED → REVIEW.
    // Test varies by type — state machines need a state, requirement
    // diagrams need a requirement.
    if (result.model && !result.errors.length) {
      const m = result.model as unknown;
      const hasContent =
        isStateMachineModelLike(m)
          ? m.states.length > 0
          : isRequirementModelLike(m)
            ? m.requirements.length > 0
            : false;
      if (hasContent) {
        useSessionStore.getState().markModelEstablished();
      }
    }
  },

  fetchCoordinates: async (source: string) => {
    const model = get().model;
    if (!model) return;
    const modelTypeId = useSessionStore.getState().modelTypeId;
    const def = getModelTypeDefinition(modelTypeId);
    const renderable = def ? def.renderPlantUml(source, model) : source;

    try {
      const svgString = await fetchSvg(renderable);
      // v7.5: each model-type definition owns coordinate extraction.
      // state-machine matches state <rect>s and pseudo-state ellipses;
      // requirement matches class-diagram entity <rect>s. Missing
      // extractor or empty map → null so the marker layer treats the
      // session as "positions unknown" rather than "zero elements".
      const extracted = def?.extractCoordinates(svgString, model);
      const coords = extracted && extracted.size > 0 ? extracted : null;
      set({ coordinates: coords, svgString, svgFetchError: null });
    } catch (e) {
      set({
        svgFetchError: e instanceof Error ? e.message : 'SVG fetch failed',
      });
    }
  },

  toggleRequirementHidden: (id: string) => {
    const model = get().model;
    if (!isRequirementModel(model)) return;
    const current = model.requirements.find((r) => r.id === id);
    if (!current || current.deleted) return;
    const willBeHidden = !current.hidden;
    const next: RequirementModel = {
      ...model,
      requirements: model.requirements.map((r) =>
        r.id === id ? { ...r, hidden: willBeHidden } : r
      ),
    };
    set({ model: next });
    // Sync to currentSource so Save / round-trip preserves the flag.
    const source = useSessionStore.getState().currentSource;
    const updated = willBeHidden
      ? insertHideMarker(source, id)
      : removeHideMarker(source, id);
    if (updated !== source) {
      useSessionStore.getState().updateSource(updated, 'review-state');
    }
  },

  markRequirementDeleted: (id: string, reason: string) => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    const model = get().model;
    if (!isRequirementModel(model)) return;
    const next: RequirementModel = {
      ...model,
      requirements: model.requirements.map((r) =>
        r.id === id
          ? {
              ...r,
              deleted: true,
              note: r.note ? `${r.note}\n${trimmed}` : trimmed,
            }
          : r
      ),
    };
    set({ model: next });
    const source = useSessionStore.getState().currentSource;
    const updated = markDeleted(source, id, trimmed);
    if (updated !== source) {
      useSessionStore.getState().updateSource(updated, 'review-state');
    }
  },

  unmarkRequirementDeleted: (id: string) => {
    const model = get().model;
    if (!isRequirementModel(model)) return;
    const next: RequirementModel = {
      ...model,
      requirements: model.requirements.map((r) =>
        r.id === id ? { ...r, deleted: false } : r
      ),
    };
    set({ model: next });
    const source = useSessionStore.getState().currentSource;
    const updated = unmarkDeleted(source, id);
    if (updated !== source) {
      useSessionStore.getState().updateSource(updated, 'review-state');
    }
  },
}));

// --- small runtime discriminators, kept local to avoid leaking types ---

function isStateMachineModelOrNull(m: unknown): m is StateMachineModel | null {
  return m === null || (typeof m === 'object' && !!m && 'states' in m);
}
function isStateMachineModelLike(m: unknown): m is { states: unknown[] } {
  return !!m && typeof m === 'object' && 'states' in m;
}
function isRequirementModelLike(m: unknown): m is { requirements: unknown[] } {
  return !!m && typeof m === 'object' && 'requirements' in m;
}
