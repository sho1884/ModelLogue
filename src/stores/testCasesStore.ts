// Store for the Test cases tab (SR-103 / UR-013).
//
// Holds the last successful NswitchGenerationResult so the UI keeps
// showing results while a new request is in flight, plus status and
// error for inline hints. `generate` cancels any previous request via
// AbortController so mid-keystroke calls don't pile up.

import { create } from 'zustand';
import type {
  CoverageMode,
  NSwitchLevel,
  NswitchGenerationResult,
} from '../types/testCase';
import { NswitchError, generate as generateApi } from '../services/nswitchService';
import { useSessionStore } from './sessionStore';

export type TestCasesStatus = 'idle' | 'loading' | 'success' | 'error';
export type TestCasesView = 'tests' | 'scenarios';

// The scope name passed to nswitch (§1.1): the session name (spaces → _), or
// `untitled` for the default/empty session — a distinctive placeholder.
function scopeName(): string {
  const raw = (useSessionStore.getState().sessionName ?? '').trim();
  if (!raw || raw === 'Untitled Session') return 'untitled';
  return raw.replace(/\s+/g, '_');
}

interface TestCasesStore {
  // Coverage selector: 0/1/2 (positive N-switch) or 'invalid' (negative).
  mode: CoverageMode;
  view: TestCasesView;
  status: TestCasesStatus;
  result: NswitchGenerationResult | null;
  error: NswitchError | null;
  setMode: (mode: CoverageMode) => void;
  setView: (v: TestCasesView) => void;
  requestGeneration: (source: string) => Promise<void>;
  reset: () => void;
}

let inflight: AbortController | null = null;

export const useTestCasesStore = create<TestCasesStore>((set, get) => ({
  mode: 1,
  view: 'tests',
  status: 'idle',
  result: null,
  error: null,

  setMode: (mode) => {
    set({ mode });
    // The effect in MainLayout re-triggers on mode change, so we do not
    // fire the request from the store itself — keeps the store pure and
    // the fetch-orchestration logic in one place.
  },

  setView: (view) => set({ view }),

  reset: () => {
    if (inflight) inflight.abort();
    inflight = null;
    set({ status: 'idle', result: null, error: null });
  },

  requestGeneration: async (source: string) => {
    if (inflight) inflight.abort();
    const controller = new AbortController();
    inflight = controller;
    set({ status: 'loading', error: null });
    try {
      const mode = get().mode;
      const modeOpts =
        mode === 'invalid'
          ? { invalid: true, n: 0 as NSwitchLevel }
          : { n: mode };
      const result = await generateApi(source, {
        ...modeOpts,
        name: scopeName(),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      set({ status: 'success', result, error: null });
    } catch (e) {
      // AbortError from a superseding call is not a failure.
      if ((e as { name?: string })?.name === 'AbortError') return;
      const err =
        e instanceof NswitchError
          ? e
          : new NswitchError({
              message:
                e instanceof Error ? e.message : 'Unexpected client error',
              kind: 'unknown',
              status: null,
              probedUrl: '(unknown)',
              cause: e,
            });
      set({ status: 'error', error: err });
    } finally {
      if (inflight === controller) inflight = null;
    }
  },
}));
