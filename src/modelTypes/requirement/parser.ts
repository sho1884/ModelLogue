// SR-110: Parse requirement-diagram input into RequirementModel.
//
// Conforms to src/grammars/requirementDiagram.ebnf v2.0. Accepts the
// macro DSL form and a semi-structured seed form in any mix, and
// extracts review-state metadata from PlantUML comment directives
// (`' @modellogue hide / deleted / note`).
//
// Core principle (2026-04-23): the source is a subset of PlantUML.
// Review-state is expressed in comments so the source renders
// directly on PlantUML Server without going through ModelLogue. The
// parser reads the comment directives to populate Requirement.hidden
// / deleted / note, but the semantic payload is invisible to PlantUML.

import type {
  Requirement,
  RequirementModel,
  RequirementRelation,
  RequirementRelationKind,
  RequirementType,
} from './model';
import type { ParseError, RequirementParseResult } from './parseResult';

// ===== Patterns =====

const IDENT_SRC = '[A-Za-z_][A-Za-z0-9_]*';

const MACRO_CALL_RE = new RegExp(
  `^\\$(${[
    'req',
    'fReq',
    'nfReq',
    'dConstraint',
    'contain',
    'derive',
    'refine',
    'satisfy',
    'verify',
    'trace',
    'copy',
  ].join('|')})\\s*\\(\\s*(.*)\\s*\\)\\s*$`
);

const PACKAGE_OPEN_RE = new RegExp(
  `^package\\s+"([^"]+)"(?:\\s+<<[^>]*>>)?\\s*\\{\\s*$`
);

const SEED_ARROW_RE = new RegExp(
  `^(${IDENT_SRC})\\s*-->\\s*(${IDENT_SRC})(?:\\s*:\\s*(.+?))?\\s*$`
);

const SEED_ROW_FIRST_CELL_RE = new RegExp(`^${IDENT_SRC}$`);

const TOLERATED_RE = new RegExp(
  `^(?:` +
    `hide\\b|show\\b|skinparam\\b|!theme\\b|!pragma\\b|!include\\b|!define\\b|` +
    `scale\\b|title\\b|caption\\b|header\\b|footer\\b|mainframe\\b|` +
    `legend\\b|end\\s+legend\\b|` +
    `note\\b|end\\s+note\\b|` +
    `left\\s+to\\s+right\\s+direction\\b|top\\s+to\\s+bottom\\s+direction\\b` +
    `)`,
  'i'
);

// Review-state comment directives (ADR-014, 2026-04-23 redesign).
// Full-line pattern `' @modellogue <verb> "id" ["extra"]`.
const REVIEW_STATE_RE =
  /^'\s*@modellogue\s+(hide|deleted|note|deleted-side)\b\s*(.*)$/;

// Commented-out declaration or relation line, possibly with a trailing
// `' @modellogue deleted-side "id"` tag. Used inside delete blocks.
const COMMENTED_MACRO_RE = new RegExp(
  `^'\\s*(\\$(?:req|fReq|nfReq|dConstraint|contain|derive|refine|satisfy|verify|trace|copy)\\s*\\([^)]*\\))` +
    `(?:\\s*'\\s*@modellogue\\s+deleted-side\\s+"([^"]+)")?` +
    `\\s*$`
);

// ===== Tables =====

const REQUIREMENT_MACRO_TO_TYPE: Record<string, RequirementType> = {
  req: 'requirement',
  fReq: 'functionalRequirement',
  nfReq: 'nonFunctionalRequirement',
  dConstraint: 'designConstraint',
};

const RELATION_MACRO_KINDS = new Set<string>([
  'contain',
  'derive',
  'refine',
  'satisfy',
  'verify',
  'trace',
  'copy',
]);

const SEED_ARROW_KIND_MAP: Record<string, RequirementRelationKind> = {
  derive: 'derive',
  derivereqt: 'derive',
  containment: 'contain',
  contain: 'contain',
  refine: 'refine',
  copy: 'copy',
};

const SEED_TYPE_MAP: Record<string, RequirementType> = {
  func: 'functionalRequirement',
  functional: 'functionalRequirement',
  nfunc: 'nonFunctionalRequirement',
  nonfunc: 'nonFunctionalRequirement',
  nonfunctional: 'nonFunctionalRequirement',
  'non-func': 'nonFunctionalRequirement',
  'non-functional': 'nonFunctionalRequirement',
  constraint: 'designConstraint',
  c: 'designConstraint',
  req: 'requirement',
  requirement: 'requirement',
};

// ===== Helpers =====

function stripInlineComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "'" && !inQuote) return line.slice(0, i).trimEnd();
  }
  return line;
}

function parseQuotedArgs(argStr: string): string[] | null {
  const args: string[] = [];
  let i = 0;
  const s = argStr;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] !== '"') return null;
    i++;
    let buf = '';
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < s.length) {
        buf += s[i + 1];
        i += 2;
      } else {
        buf += s[i];
        i++;
      }
    }
    if (i >= s.length) return null;
    i++;
    args.push(buf);
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i < s.length) {
      if (s[i] !== ',') return null;
      i++;
    }
  }
  return args;
}

function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let i = 0;
  const s = row;
  while (i <= s.length) {
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length) {
      cells.push('');
      break;
    }
    if (s[i] === '"') {
      i++;
      let buf = '';
      while (i < s.length) {
        if (s[i] === '"' && s[i + 1] === '"') {
          buf += '"';
          i += 2;
        } else if (s[i] === '"') {
          i++;
          break;
        } else {
          buf += s[i];
          i++;
        }
      }
      cells.push(buf);
      while (i < s.length && s[i] === ' ') i++;
      if (i < s.length && s[i] === ',') {
        i++;
        continue;
      }
      break;
    } else {
      let buf = '';
      while (i < s.length && s[i] !== ',') {
        buf += s[i];
        i++;
      }
      cells.push(buf.trim());
      if (i < s.length && s[i] === ',') {
        i++;
        continue;
      }
      break;
    }
  }
  return cells;
}

/**
 * Parse the payload of a review-state directive after the verb.
 * Example: `"R1" "out of scope"` → ["R1", "out of scope"].
 * Arguments are space-separated quoted strings (unlike macro calls,
 * which use commas).
 */
function parseReviewStatePayload(payload: string): string[] | null {
  const args: string[] = [];
  let i = 0;
  const s = payload;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] !== '"') return null;
    i++;
    let buf = '';
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < s.length) {
        buf += s[i + 1];
        i += 2;
      } else {
        buf += s[i];
        i++;
      }
    }
    if (i >= s.length) return null; // unterminated
    i++;
    args.push(buf);
  }
  return args;
}

// ===== Parser state =====

type PendingMeta =
  | { kind: 'hide'; id: string; line: number }
  | { kind: 'note'; id: string; text: string; line: number };

interface PendingDelete {
  id: string;
  reason: string;
  line: number;
}

interface PackageFrame {
  name: string;
  startLine: number;
}

// ===== Main parse function =====

export function parse(source: string): RequirementParseResult {
  const errors: ParseError[] = [];
  const reqById = new Map<string, Requirement>();
  const addedIds: string[] = [];
  const relations: RequirementRelation[] = [];
  const pendingMeta: PendingMeta[] = [];

  const addRequirement = (r: Requirement, line: number): void => {
    const existing = reqById.get(r.id);
    if (existing) {
      // If the existing one was the commented-out declaration for a
      // delete block (deleted=true) and we now see an uncommented one,
      // that's a conflict; treat as a duplicate so the user can fix it.
      errors.push({ line, message: `duplicate requirement id '${r.id}'` });
      return;
    }
    reqById.set(r.id, r);
    addedIds.push(r.id);
  };

  const lines = source.split('\n');
  let inBlock = false;
  let inProcedure = false;
  const packageStack: PackageFrame[] = [];
  let pendingDelete: PendingDelete | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Expire a pendingDelete if we hit a non-empty line that isn't the
    // expected commented declaration (handled further down).
    // (Blank lines also expire it to avoid the marker surviving across
    // unrelated content.)
    const expirePendingDeleteIfBlank = () => {
      if (pendingDelete) pendingDelete = null;
    };

    if (trimmed === '') {
      expirePendingDeleteIfBlank();
      continue;
    }

    // ----- review-state comments (highest priority among comments) -----
    const reviewMatch = trimmed.match(REVIEW_STATE_RE);
    if (reviewMatch) {
      const verb = reviewMatch[1];
      const payload = reviewMatch[2];
      const args = parseReviewStatePayload(payload);
      if (args === null) {
        errors.push({
          line: lineNum,
          message: `malformed @modellogue ${verb} directive`,
        });
        pendingDelete = null;
        continue;
      }
      if (verb === 'hide') {
        if (args.length !== 1) {
          errors.push({
            line: lineNum,
            message: `@modellogue hide expects "id" (got ${args.length} arg(s))`,
          });
          pendingDelete = null;
          continue;
        }
        pendingMeta.push({ kind: 'hide', id: args[0], line: lineNum });
        pendingDelete = null;
        continue;
      }
      if (verb === 'note') {
        if (args.length !== 2) {
          errors.push({
            line: lineNum,
            message: `@modellogue note expects "id" "text" (got ${args.length} arg(s))`,
          });
          pendingDelete = null;
          continue;
        }
        pendingMeta.push({
          kind: 'note',
          id: args[0],
          text: args[1],
          line: lineNum,
        });
        pendingDelete = null;
        continue;
      }
      if (verb === 'deleted') {
        if (args.length !== 2 || !args[1].trim()) {
          errors.push({
            line: lineNum,
            message: `@modellogue deleted expects "id" "reason" with a non-empty reason (ADR-014)`,
          });
          pendingDelete = null;
          continue;
        }
        pendingDelete = { id: args[0], reason: args[1], line: lineNum };
        continue;
      }
      // deleted-side: always a no-op at the marker position itself.
      // (The tagged commented-out macro line is recognized below.)
      pendingDelete = null;
      continue;
    }

    // ----- commented-out macro call (delete-block body or suppressed relation) -----
    const commentedMacro = trimmed.match(COMMENTED_MACRO_RE);
    if (commentedMacro) {
      const macroSnippet = commentedMacro[1];
      const deletedSideId = commentedMacro[2];
      if (deletedSideId !== undefined) {
        // Tagged suppressed relation — always skipped, no matter the context.
        // (pendingDelete is allowed to survive across these so the marker
        // applies to the declaration that follows the relations.)
        continue;
      }
      // Un-tagged commented macro: only meaningful when it directly
      // follows a `@modellogue deleted` marker — then it's the
      // declaration of the deleted requirement.
      if (!pendingDelete) {
        // Commented-out content with no delete marker → treat as a plain
        // comment (ignore). User's hand-commented lines should not
        // disappear into the model silently.
        continue;
      }
      const parsedCall = parseMacroCallFromSnippet(macroSnippet);
      if (!parsedCall) {
        errors.push({
          line: lineNum,
          message: `failed to parse commented declaration inside delete block`,
        });
        pendingDelete = null;
        continue;
      }
      const { name, args } = parsedCall;
      if (!(name in REQUIREMENT_MACRO_TO_TYPE)) {
        // Commented-out relation without deleted-side tag — skip it
        // quietly (still a member of the delete block) but keep the
        // pending marker for a later declaration line.
        continue;
      }
      if (args.length < 2 || args.length > 3) {
        errors.push({
          line: lineNum,
          message: `$${name} expects 2 or 3 arguments, got ${args.length}`,
        });
        pendingDelete = null;
        continue;
      }
      const [id, displayName, text] = args;
      if (id !== pendingDelete.id) {
        errors.push({
          line: lineNum,
          message: `@modellogue deleted marker id '${pendingDelete.id}' does not match the following declaration id '${id}'`,
        });
      }
      addRequirement(
        {
          id,
          statement: displayName,
          text: text ?? null,
          type: REQUIREMENT_MACRO_TO_TYPE[name],
          parentId:
            packageStack.length > 0
              ? packageStack[packageStack.length - 1].name
              : null,
          hidden: false,
          deleted: true,
          note: pendingDelete.reason,
          level: null,
          group: null,
        },
        lineNum
      );
      pendingDelete = null;
      continue;
    }

    // ----- any OTHER comment line -----
    if (trimmed.startsWith("'") || trimmed.startsWith('#')) {
      pendingDelete = null;
      continue;
    }

    // Strip inline comment for the rest of this iteration
    const raw = stripInlineComment(trimmed);
    if (raw === '') continue;

    // !procedure ... !endprocedure — swallow
    if (inProcedure) {
      if (/^!endprocedure\b/i.test(raw)) inProcedure = false;
      pendingDelete = null;
      continue;
    }
    if (/^!procedure\b/i.test(raw)) {
      inProcedure = true;
      pendingDelete = null;
      continue;
    }

    if (raw.startsWith('@startuml')) {
      inBlock = true;
      pendingDelete = null;
      continue;
    }
    if (raw.startsWith('@enduml')) {
      inBlock = false;
      pendingDelete = null;
      continue;
    }
    if (!inBlock) {
      pendingDelete = null;
      continue;
    }

    // Closing brace ends the current package scope.
    if (raw === '}') {
      if (packageStack.length === 0) {
        errors.push({ line: lineNum, message: 'unmatched closing brace' });
      } else {
        packageStack.pop();
      }
      pendingDelete = null;
      continue;
    }

    const pkgOpen = raw.match(PACKAGE_OPEN_RE);
    if (pkgOpen) {
      packageStack.push({ name: pkgOpen[1], startLine: lineNum });
      pendingDelete = null;
      continue;
    }

    if (TOLERATED_RE.test(raw)) {
      pendingDelete = null;
      continue;
    }

    // Any non-comment non-empty line expires a pending delete marker
    // without consuming it — this is a parse error (we expected the
    // declaration to follow).
    if (pendingDelete) {
      errors.push({
        line: pendingDelete.line,
        message: `@modellogue deleted marker on line ${pendingDelete.line} was not followed by a commented-out declaration for '${pendingDelete.id}'`,
      });
      pendingDelete = null;
    }

    const currentParent =
      packageStack.length > 0
        ? packageStack[packageStack.length - 1].name
        : null;

    // Macro call
    const macroMatch = raw.match(MACRO_CALL_RE);
    if (macroMatch) {
      const name = macroMatch[1];
      const args = parseQuotedArgs(macroMatch[2] ?? '');
      if (args === null) {
        errors.push({
          line: lineNum,
          message: `malformed arguments in $${name}(...)`,
        });
        continue;
      }

      if (name in REQUIREMENT_MACRO_TO_TYPE) {
        if (args.length < 2 || args.length > 3) {
          errors.push({
            line: lineNum,
            message: `$${name} expects 2 or 3 arguments, got ${args.length}`,
          });
          continue;
        }
        const [id, displayName, text] = args;
        if (!id) {
          errors.push({ line: lineNum, message: `$${name}: empty id` });
          continue;
        }
        addRequirement(
          {
            id,
            statement: displayName,
            text: text ?? null,
            type: REQUIREMENT_MACRO_TO_TYPE[name],
            parentId: currentParent,
            hidden: false,
            deleted: false,
            note: '',
            level: null,
            group: null,
          },
          lineNum
        );
        continue;
      }

      if (RELATION_MACRO_KINDS.has(name)) {
        if (args.length !== 2) {
          errors.push({
            line: lineNum,
            message: `$${name} expects 2 arguments, got ${args.length}`,
          });
          continue;
        }
        relations.push({
          sourceId: args[0],
          targetId: args[1],
          kind: name as RequirementRelationKind,
        });
        continue;
      }

      errors.push({ line: lineNum, message: `unknown macro '$${name}'` });
      continue;
    }

    // Seed-form arrow
    const arrowMatch = raw.match(SEED_ARROW_RE);
    if (arrowMatch) {
      const [, src, tgt, kindRaw] = arrowMatch;
      let kind: RequirementRelationKind = 'derive';
      if (kindRaw && kindRaw.trim()) {
        const resolved = SEED_ARROW_KIND_MAP[kindRaw.trim().toLowerCase()];
        if (!resolved) {
          errors.push({
            line: lineNum,
            message:
              `unsupported seed-form arrow kind '${kindRaw.trim()}'. ` +
              `Allowed: derive / Containment / Refine / Copy. ` +
              `Use macro form ($satisfy / $verify / $trace) for others (ADR-013).`,
          });
          continue;
        }
        kind = resolved;
      }
      relations.push({ sourceId: src, targetId: tgt, kind });
      continue;
    }

    // Seed-form requirement row
    if (raw.includes(',')) {
      const cells = parseCsvRow(raw);
      if (cells.length >= 2) {
        const firstCell = cells[0].trim();
        if (SEED_ROW_FIRST_CELL_RE.test(firstCell)) {
          const id = firstCell;
          const displayName = cells[1] ?? id;
          const typeRaw = cells[2];
          const text = cells[3];
          const hiddenRaw = cells[4];
          const deletedRaw = cells[5];
          const note = cells[6] ?? '';

          let type: RequirementType = 'functionalRequirement';
          if (typeRaw !== undefined && typeRaw.trim() !== '') {
            const resolved = SEED_TYPE_MAP[typeRaw.trim().toLowerCase()];
            if (!resolved) {
              errors.push({
                line: lineNum,
                message: `unknown type '${typeRaw.trim()}' — accepted: functional / nonfunctional / constraint`,
              });
              continue;
            }
            type = resolved;
          }

          const hidden = (hiddenRaw ?? '').trim().toUpperCase() === 'Y';
          const deleted = (deletedRaw ?? '').trim().toUpperCase() === 'Y';

          if (deleted && note.trim() === '') {
            errors.push({
              line: lineNum,
              message: `seed row '${id}' has deleted=Y but empty note; a reason is required (ADR-014)`,
            });
            continue;
          }

          addRequirement(
            {
              id,
              statement: displayName || id,
              text: text && text.trim() !== '' ? text : null,
              type,
              parentId: currentParent,
              hidden,
              deleted,
              note,
              level: null,
              group: null,
            },
            lineNum
          );
          continue;
        }
      }
    }

    errors.push({ line: lineNum, message: `unrecognized syntax: ${raw}` });
  }

  if (packageStack.length > 0) {
    errors.push({
      line: lines.length,
      message: `unclosed package started at line ${packageStack[0].startLine}`,
    });
  }
  if (inProcedure) {
    errors.push({
      line: lines.length,
      message: '!procedure block without !endprocedure',
    });
  }
  if (pendingDelete) {
    errors.push({
      line: pendingDelete.line,
      message: `@modellogue deleted marker on line ${pendingDelete.line} has no following commented-out declaration`,
    });
  }

  // Apply hide / note meta against declared requirements.
  for (const m of pendingMeta) {
    const r = reqById.get(m.id);
    if (!r) {
      errors.push({
        line: m.line,
        message: `@modellogue ${m.kind}: unknown requirement id '${m.id}'`,
      });
      continue;
    }
    if (m.kind === 'hide') {
      r.hidden = true;
    } else {
      r.note = r.note ? `${r.note}\n${m.text}` : m.text;
    }
  }

  // $contain second pass: parent/child relationship writes to parentId
  // (second pass so declaration order doesn't matter).
  for (const rel of relations) {
    if (rel.kind !== 'contain') continue;
    const child = reqById.get(rel.targetId);
    if (child) child.parentId = rel.sourceId;
  }

  const model: RequirementModel = {
    requirements: addedIds.map((id) => reqById.get(id)!),
    relations,
  };

  return { model, errors };
}

/**
 * Parse a `$macro(arg1, arg2, ...)` snippet extracted from a commented
 * line, returning the macro name and the list of string arguments.
 */
function parseMacroCallFromSnippet(
  snippet: string
): { name: string; args: string[] } | null {
  const m = snippet.match(MACRO_CALL_RE);
  if (!m) return null;
  const args = parseQuotedArgs(m[2] ?? '');
  if (!args) return null;
  return { name: m[1], args };
}
