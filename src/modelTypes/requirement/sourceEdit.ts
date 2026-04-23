// Source-edit helpers for requirement-diagram review-state transitions
// (ADR-014, redesigned 2026-04-23).
//
// Review-state is expressed in PlantUML COMMENTS, not in ModelLogue-
// invented macros, so the edit buffer stays a valid PlantUML subset.
//
//   ' @modellogue hide "id"            — hide marker (declaration stays
//                                        uncommented in source)
//   ' @modellogue deleted "id" "reason"— deleted marker, followed by
//                                        the commented-out declaration
//   ' <macro>(...) ' @modellogue deleted-side "id"
//                                      — suppressed relation tag
//   ' @modellogue note "id" "text"     — free-form note
//
// These helpers compose small textual edits on the source so the
// model-side toggle actions in modelStore can keep the buffer in sync
// with the on-screen state without invoking the full parser.

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeQuotedArg(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ===== pattern builders =====

const REQ_MACRO_NAMES = ['req', 'fReq', 'nfReq', 'dConstraint'];
const RELATION_MACRO_NAMES = [
  'contain',
  'derive',
  'refine',
  'satisfy',
  'verify',
  'trace',
  'copy',
];

const HIDE_MARKER_RE = (id: string) =>
  new RegExp(
    `^\\s*'\\s*@modellogue\\s+hide\\s+"${escapeForRegex(id)}"\\s*$`
  );

const DELETED_MARKER_RE = (id: string) =>
  new RegExp(
    `^\\s*'\\s*@modellogue\\s+deleted\\s+"${escapeForRegex(id)}"\\s+".*"\\s*$`
  );

const NOTE_MARKER_RE = (id: string) =>
  new RegExp(
    `^\\s*'\\s*@modellogue\\s+note\\s+"${escapeForRegex(id)}"\\s+".*"\\s*$`
  );

const REQ_DECL_LINE_RE = (id: string) =>
  new RegExp(
    `^(\\s*)(\\$(?:${REQ_MACRO_NAMES.join('|')}))\\s*\\(\\s*"${escapeForRegex(id)}"\\s*,`
  );

const COMMENTED_REQ_DECL_LINE_RE = (id: string) =>
  new RegExp(
    `^(\\s*)'\\s+\\$(?:${REQ_MACRO_NAMES.join('|')})\\s*\\(\\s*"${escapeForRegex(id)}"\\s*,`
  );

const DELETED_SIDE_TAG_RE = (id: string) =>
  new RegExp(
    `\\s*'\\s*@modellogue\\s+deleted-side\\s+"${escapeForRegex(id)}"\\s*$`
  );

// ===== low-level line tools =====

/**
 * Insert `line` immediately before the last `@enduml`. If no `@enduml`
 * exists, append at end with a preceding newline.
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

function relationLineTouchesId(line: string, id: string): boolean {
  const m = line.match(
    new RegExp(
      `^\\s*\\$(?:${RELATION_MACRO_NAMES.join('|')})\\s*\\(\\s*"([^"]+)"\\s*,\\s*"([^"]+)"\\s*\\)`
    )
  );
  if (!m) return false;
  return m[1] === id || m[2] === id;
}

// ===== hide =====

export function insertHideMarker(source: string, id: string): string {
  if (source.split('\n').some((l) => HIDE_MARKER_RE(id).test(l))) {
    return source;
  }
  return insertBeforeEnduml(source, `' @modellogue hide "${escapeQuotedArg(id)}"`);
}

export function removeHideMarker(source: string, id: string): string {
  const pattern = HIDE_MARKER_RE(id);
  return source
    .split('\n')
    .filter((l) => !pattern.test(l))
    .join('\n');
}

// ===== delete =====

/**
 * Comment out the declaration for `id` and all relations touching it,
 * and insert a delete marker carrying `reason`. Idempotent: if the id
 * is already marked deleted, `source` is returned unchanged.
 */
export function markDeleted(
  source: string,
  id: string,
  reason: string
): string {
  if (source.split('\n').some((l) => DELETED_MARKER_RE(id).test(l))) {
    return source;
  }
  const markerLine = `' @modellogue deleted "${escapeQuotedArg(id)}" "${escapeQuotedArg(reason)}"`;
  const sideTag = ` ' @modellogue deleted-side "${escapeQuotedArg(id)}"`;

  const declRe = REQ_DECL_LINE_RE(id);
  const out: string[] = [];
  let declCommented = false;

  for (const line of source.split('\n')) {
    const declMatch = line.match(declRe);
    if (!declCommented && declMatch) {
      const leading = declMatch[1];
      const rest = line.slice(leading.length);
      out.push(markerLine);
      out.push(`${leading}' ${rest}`);
      declCommented = true;
      continue;
    }
    if (relationLineTouchesId(line, id)) {
      const leading = line.match(/^(\s*)/)?.[1] ?? '';
      const rest = line.slice(leading.length);
      out.push(`${leading}' ${rest}${sideTag}`);
      continue;
    }
    out.push(line);
  }

  // If we couldn't find the declaration, don't mutate — the caller
  // will see the model stays deleted=false.
  if (!declCommented) return source;
  return out.join('\n');
}

/**
 * Restore a previously-deleted requirement: remove the marker,
 * un-comment the declaration that follows, and un-comment all
 * `deleted-side`-tagged relations.
 */
export function unmarkDeleted(source: string, id: string): string {
  const markerRe = DELETED_MARKER_RE(id);
  const commentedDeclRe = COMMENTED_REQ_DECL_LINE_RE(id);
  const sideTagRe = DELETED_SIDE_TAG_RE(id);

  const lines = source.split('\n');
  const out: string[] = [];
  let sawMarker = false;
  let declUncommented = false;

  for (const line of lines) {
    if (!sawMarker && markerRe.test(line)) {
      sawMarker = true;
      continue; // drop marker
    }
    if (sawMarker && !declUncommented && commentedDeclRe.test(line)) {
      out.push(line.replace(/^(\s*)'\s+/, '$1'));
      declUncommented = true;
      sawMarker = false;
      continue;
    }
    if (sideTagRe.test(line)) {
      // Strip the tag, then un-comment.
      const stripped = line.replace(sideTagRe, '');
      out.push(stripped.replace(/^(\s*)'\s+/, '$1'));
      continue;
    }
    out.push(line);
  }

  return out.join('\n');
}

// ===== note =====

export function insertNoteMarker(
  source: string,
  id: string,
  text: string
): string {
  return insertBeforeEnduml(
    source,
    `' @modellogue note "${escapeQuotedArg(id)}" "${escapeQuotedArg(text)}"`
  );
}

export function removeNoteMarkers(source: string, id: string): string {
  const pattern = NOTE_MARKER_RE(id);
  return source
    .split('\n')
    .filter((l) => !pattern.test(l))
    .join('\n');
}
