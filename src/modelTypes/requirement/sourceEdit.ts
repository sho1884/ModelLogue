// Source-edit helpers for requirement-diagram sessions.
//
// When the user toggles visibility (SR-113 checkbox) or soft-deletes a
// requirement via the list tab dialog, the change must propagate into
// `sessionStore.currentSource` as a $hide(id) or $deleted(id, reason)
// line. That way:
//   - Save .puml writes the source with review state preserved
//   - Open saved review re-parses and restores the state
//   - Chat proposals that re-seed `currentSource` carry the state through
//
// The helpers are pure string→string transforms so modelStore can call
// them synchronously and forward the result to sessionStore.updateSource.

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeQuotedArg(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Insert a line immediately before the last `@enduml` line in `source`.
 * If no `@enduml` exists, append at end (with a preceding newline).
 */
export function insertBeforeEnduml(source: string, line: string): string {
  const lines = source.split('\n');
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '@enduml') {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    const sep = source.length === 0 || source.endsWith('\n') ? '' : '\n';
    return source + sep + line + '\n';
  }
  return [...lines.slice(0, idx), line, ...lines.slice(idx)].join('\n');
}

/**
 * Remove every line that matches `predicate`. Whitespace is preserved.
 */
function removeLinesMatching(
  source: string,
  predicate: (line: string) => boolean
): string {
  return source
    .split('\n')
    .filter((line) => !predicate(line))
    .join('\n');
}

const HIDE_LINE_RE = (id: string) =>
  new RegExp(`^\\s*\\$hide\\s*\\(\\s*"${escapeForRegex(id)}"\\s*\\)\\s*$`);

const DELETED_LINE_RE = (id: string) =>
  new RegExp(`^\\s*\\$deleted\\s*\\(\\s*"${escapeForRegex(id)}"\\s*,`);

/** `$hide("id")` with the given id. */
export function ensureHideLine(source: string, id: string): string {
  const pattern = HIDE_LINE_RE(id);
  if (source.split('\n').some((l) => pattern.test(l))) return source;
  return insertBeforeEnduml(source, `$hide("${escapeQuotedArg(id)}")`);
}

export function removeHideLine(source: string, id: string): string {
  const pattern = HIDE_LINE_RE(id);
  return removeLinesMatching(source, (l) => pattern.test(l));
}

/** `$deleted("id", "reason")` — replaces any existing line for that id. */
export function ensureDeletedLine(
  source: string,
  id: string,
  reason: string
): string {
  const pattern = DELETED_LINE_RE(id);
  const cleared = removeLinesMatching(source, (l) => pattern.test(l));
  return insertBeforeEnduml(
    cleared,
    `$deleted("${escapeQuotedArg(id)}", "${escapeQuotedArg(reason)}")`
  );
}

export function removeDeletedLine(source: string, id: string): string {
  const pattern = DELETED_LINE_RE(id);
  return removeLinesMatching(source, (l) => pattern.test(l));
}
