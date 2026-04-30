// SR-126 — integration: parseSuggestion populated by modelStore,
// cleared by re-parse, and consumed by setModelTypeIdKeepingSource.
//
// Covers acceptance criteria that span service + stores:
//   #6 Switch keeps currentSource intact
//   #7 Switch produces a clean parse + banner disappears
//   #8 Header-dropdown setModelTypeId clears the suggestion (via re-parse)

import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore } from '../../src/stores/modelStore';
import { useSessionStore } from '../../src/stores/sessionStore';

const PROCESS_SOURCE = `@startuml
|顧客|
start
:申込書を提出;
:本人確認を行う;
if (本人確認 OK?) then (yes)
  :口座を開設する;
else (no)
  :申し込みを差し戻す;
endif
stop
@enduml`;

function resetStores() {
  // Re-create a fresh session shape; the easiest is reaching directly
  // into the zustand stores' setState.
  useSessionStore.setState({
    sessionId: 'test',
    sessionName: 'test',
    createdAt: new Date().toISOString(),
    modelTypeId: 'state-machine',
    currentSource: '',
    sourceHistory: [],
    redoStack: [],
    messages: [],
    outcome: null,
    hasEstablishedModel: false,
  });
  useModelStore.setState({
    model: null,
    parseErrors: [],
    stateEventMatrix: null,
    stateStateMatrix: null,
    coordinates: null,
    svgString: null,
    svgFetchError: null,
    pendingAutoMarkerBefore: null,
    parseSuggestion: null,
  });
}

describe('parseSuggestion flow (SR-126)', () => {
  beforeEach(resetStores);

  it('populates parseSuggestion when active parse fails and an alt is clean', () => {
    // Active = state-machine, source is process — should suggest.
    useModelStore.getState().parseSource(PROCESS_SOURCE);
    const sug = useModelStore.getState().parseSuggestion;
    expect(sug).not.toBeNull();
    expect(sug!.suggestedTypeId).toBe('process');
    expect(sug!.activeTypeId).toBe('state-machine');
    expect(sug!.activeErrorCount).toBeGreaterThan(0);
    expect(sug!.suggestedErrorCount).toBe(0);
  });

  it('AC #6: setModelTypeIdKeepingSource changes type AND keeps currentSource intact', () => {
    useSessionStore.setState({ currentSource: PROCESS_SOURCE });
    expect(useSessionStore.getState().modelTypeId).toBe('state-machine');
    useSessionStore.getState().setModelTypeIdKeepingSource('process');
    expect(useSessionStore.getState().modelTypeId).toBe('process');
    // Critically, currentSource is UNCHANGED — this is the whole point
    // (it differs from the header-dropdown setModelTypeId which would
    // clobber the source with the new type's defaultSeedSource).
    expect(useSessionStore.getState().currentSource).toBe(PROCESS_SOURCE);
  });

  it('AC #7: re-parse after the source-preserving switch yields a clean parse and clears the suggestion', () => {
    useSessionStore.setState({ currentSource: PROCESS_SOURCE });
    useModelStore.getState().parseSource(PROCESS_SOURCE);
    expect(useModelStore.getState().parseSuggestion).not.toBeNull();

    // The MainLayout effect would call this on its own in the real app
    // (modelTypeId is in the dependency array). Here we simulate it.
    useSessionStore.getState().setModelTypeIdKeepingSource('process');
    useModelStore
      .getState()
      .parseSource(useSessionStore.getState().currentSource);

    expect(useModelStore.getState().parseErrors).toEqual([]);
    expect(useModelStore.getState().parseSuggestion).toBeNull();
  });

  it('AC #8: header-dropdown setModelTypeId clears the suggestion (via re-parse on the new defaultSeedSource)', () => {
    useSessionStore.setState({ currentSource: PROCESS_SOURCE });
    useModelStore.getState().parseSource(PROCESS_SOURCE);
    expect(useModelStore.getState().parseSuggestion).not.toBeNull();

    // The header dropdown switch resets currentSource to the new
    // type's defaultSeedSource; the calling React effect re-parses
    // the new source. Here we simulate that pair.
    useSessionStore.getState().setModelTypeId('requirement');
    useModelStore
      .getState()
      .parseSource(useSessionStore.getState().currentSource);

    expect(useModelStore.getState().parseSuggestion).toBeNull();
    // (And currentSource is now the requirement type's preamble — the
    // user has explicitly opted to start fresh by using the dropdown.)
    expect(useSessionStore.getState().currentSource).not.toBe(PROCESS_SOURCE);
  });

  it('setModelTypeIdKeepingSource is a no-op after REVIEW phase (model established)', () => {
    useSessionStore.setState({
      currentSource: PROCESS_SOURCE,
      hasEstablishedModel: true,
      modelTypeId: 'state-machine',
    });
    useSessionStore.getState().setModelTypeIdKeepingSource('process');
    // Locked: stays state-machine
    expect(useSessionStore.getState().modelTypeId).toBe('state-machine');
  });

  it('setModelTypeIdKeepingSource ignores unknown type ids', () => {
    useSessionStore.setState({ modelTypeId: 'state-machine' });
    useSessionStore.getState().setModelTypeIdKeepingSource('does-not-exist');
    // resolveModelTypeId falls back to state-machine; the store's
    // no-op-on-same-id guard then keeps the existing type.
    expect(useSessionStore.getState().modelTypeId).toBe('state-machine');
  });
});

describe('bootstrapFromBundle SR-129 auto-detect', () => {
  beforeEach(resetStores);

  it('respects bundle.modelTypeId when set (no auto-detect runs)', () => {
    useSessionStore.getState().bootstrapFromBundle({
      modelTypeId: 'requirement',
      plantUmlSource: PROCESS_SOURCE, // process-shaped, but bundle says requirement
    });
    // Bundle's explicit type wins, even when content disagrees. The
    // mismatch will be flagged by SR-126's banner at parse time.
    expect(useSessionStore.getState().modelTypeId).toBe('requirement');
  });

  it('auto-detects modelTypeId when bundle has no type and a process source', () => {
    useSessionStore.getState().bootstrapFromBundle({
      plantUmlSource: PROCESS_SOURCE,
    });
    expect(useSessionStore.getState().modelTypeId).toBe('process');
  });

  it('auto-detects requirement type from a requirement-shaped bundle', () => {
    const reqSource = `@startuml
$fReq("R1", "first requirement")
$fReq("R2", "second requirement")
$contain("R1", "R2")
@enduml`;
    useSessionStore.getState().bootstrapFromBundle({
      plantUmlSource: reqSource,
    });
    expect(useSessionStore.getState().modelTypeId).toBe('requirement');
  });

  it('falls back to default when bundle has no type and no source', () => {
    useSessionStore.getState().bootstrapFromBundle({});
    // Default is state-machine.
    expect(useSessionStore.getState().modelTypeId).toBe('state-machine');
  });

  it('falls back to default when source is non-trivial but no parser fits', () => {
    const garbage = `Plain English prose, not PlantUML at all.
This will fail every registered parser.
None of them will accept this kind of input as a valid model.`;
    useSessionStore.getState().bootstrapFromBundle({
      plantUmlSource: garbage,
    });
    expect(useSessionStore.getState().modelTypeId).toBe('state-machine');
  });

  it('falls back to default when source is trivial (skips auto-detect)', () => {
    useSessionStore.getState().bootstrapFromBundle({
      plantUmlSource: '@startuml\n@enduml',
    });
    expect(useSessionStore.getState().modelTypeId).toBe('state-machine');
  });
});
