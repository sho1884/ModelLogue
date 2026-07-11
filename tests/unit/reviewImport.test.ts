import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  coerceToSeedBundle,
  importParsedJson,
  importFromUrl,
} from '../../src/services/reviewImport';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useChatStore } from '../../src/stores/chatStore';
import { useRequirementsStore } from '../../src/stores/requirementsStore';

describe('coerceToSeedBundle', () => {
  it('extracts source / requirements / name / modelTypeId', () => {
    const seed = coerceToSeedBundle({
      plantUmlSource: '@startuml\n[*] --> A\n@enduml',
      requirementsText: 'req',
      name: 'My review',
      modelTypeId: 'state-machine',
    });
    expect(seed.plantUmlSource).toContain('@startuml');
    expect(seed.requirementsText).toBe('req');
    expect(seed.sessionName).toBe('My review'); // ReviewSession `name` maps to sessionName
    expect(seed.modelTypeId).toBe('state-machine');
  });

  it('throws when neither source nor requirements is present', () => {
    expect(() => coerceToSeedBundle({ foo: 1 })).toThrow();
    expect(() => coerceToSeedBundle(null)).toThrow();
  });
});

describe('importParsedJson dispatch by shape', () => {
  beforeEach(() => {
    useChatStore.getState().clear();
    useSessionStore.setState({ hasEstablishedModel: false, currentSource: '' });
  });

  it('a ReviewSession (has messages[]) is restored whole (conversation comes back)', () => {
    importParsedJson({
      name: 'R',
      plantUmlSource: '@startuml\n[*] --> A\n@enduml',
      modelTypeId: 'state-machine',
      messages: [
        { id: 'm1', role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00Z' },
      ],
      sourceHistory: [],
      markers: [],
    });
    expect(useSessionStore.getState().hasEstablishedModel).toBe(true);
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('a bare SeedBundle (no messages) seeds the source without a conversation', () => {
    importParsedJson({
      plantUmlSource: '@startuml\n[*] --> B\n@enduml',
      requirementsText: 'seeded',
    });
    expect(useSessionStore.getState().currentSource).toContain('--> B');
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useRequirementsStore.getState().requirementsText).toBe('seeded');
  });
});

describe('importFromUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a non-https URL without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(importFromUrl('http://example.com/x.json')).rejects.toThrow(
      /non-https/i
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches an https URL and imports it', async () => {
    useSessionStore.setState({ currentSource: '' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ plantUmlSource: '@startuml\n[*] --> C\n@enduml' }),
        { status: 200 }
      )
    );
    await importFromUrl('https://example.com/sample.json');
    expect(useSessionStore.getState().currentSource).toContain('--> C');
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 404 })
    );
    await expect(
      importFromUrl('https://example.com/missing.json')
    ).rejects.toThrow(/404/);
  });
});
