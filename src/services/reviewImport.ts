// Shared review-loading logic (SR-083 file import + SR-141 ?file= startup).
//
// A saved JSON is dispatched BY SHAPE, identically for both entry points:
//   - a full ReviewSession (has a `messages` array) is restored whole so the
//     conversation can continue (restoreFromReview);
//   - a bare SeedBundle (source / requirements only) seeds a fresh session
//     (bootstrapFromBundle).
// Header.handleFileChange (file picker) and the App startup effect both call
// importParsedJson so there is a single dispatch, not two copies.

import { useSessionStore } from '../stores/sessionStore';
import type { ReviewSession, SeedBundle } from '../types/session';

/**
 * Coerce an arbitrary parsed JSON object into a SeedBundle. Used for files
 * that are NOT a full ReviewSession (no conversation): external starter
 * files produced by a workflow, or a saved bundle with source/requirements
 * only. Throws with a human-readable message if nothing usable is present.
 */
export function coerceToSeedBundle(parsed: unknown): SeedBundle {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('File is not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  const seed: SeedBundle = {};
  if (typeof obj.requirementsText === 'string') {
    seed.requirementsText = obj.requirementsText;
  }
  if (typeof obj.plantUmlSource === 'string') {
    seed.plantUmlSource = obj.plantUmlSource;
  }
  if (typeof obj.sessionName === 'string') {
    seed.sessionName = obj.sessionName;
  } else if (typeof obj.name === 'string') {
    // ReviewSession uses `name` (not `sessionName`)
    seed.sessionName = obj.name;
  }
  // SR-073 (v7.5): preserve the saved session's model type on re-open.
  // Unknown ids are tolerated by sessionStore.resolveModelTypeId.
  if (typeof obj.modelTypeId === 'string') {
    seed.modelTypeId = obj.modelTypeId;
  }
  if (
    seed.requirementsText === undefined &&
    seed.plantUmlSource === undefined
  ) {
    throw new Error('No requirementsText or plantUmlSource found in the file');
  }
  return seed;
}

/**
 * Dispatch a parsed JSON value into the session: a full ReviewSession
 * (carries a `messages` array) is restored whole so the discussion can
 * continue; anything else is coerced to a SeedBundle and seeds the source.
 * Throws if the value can't be used at all.
 */
export function importParsedJson(parsed: unknown): void {
  const s = useSessionStore.getState();
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>).messages)
  ) {
    s.restoreFromReview(parsed as ReviewSession);
  } else {
    s.bootstrapFromBundle(coerceToSeedBundle(parsed));
  }
}

/**
 * SR-141: fetch a review/seed JSON from a URL and import it. Only https URLs
 * are honoured (the content is treated as untrusted data, never executed).
 * Throws with a human-readable message on network / parse / shape errors so
 * the caller can surface the shared import-error banner.
 */
export async function importFromUrl(url: string): Promise<void> {
  // Resolve against the document base when running in a browser (so a
  // relative ?file= works); an absolute URL ignores the base and also works
  // outside a browser (tests).
  const base =
    typeof window !== 'undefined' ? window.location.href : undefined;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, base);
  } catch {
    throw new Error(`Not a valid URL: ${url}`);
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error(`Refusing to load a non-https URL: ${parsedUrl.protocol}`);
  }
  const res = await fetch(parsedUrl.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch (${res.status}) ${parsedUrl.toString()}`);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fetched file is not valid JSON');
  }
  importParsedJson(parsed);
}
