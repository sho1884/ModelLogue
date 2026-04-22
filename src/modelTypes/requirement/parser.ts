// SR-110: Parse requirement-diagram input into RequirementModel.
//
// Conforms to src/grammars/requirementDiagram.ebnf v1.2. Accepts two
// coexisting input forms in any mix:
//
//   Macro DSL form (canonical):
//     $req / $fReq / $nfReq / $dConstraint          — requirements
//     $contain / $derive / $refine / $satisfy /
//       $verify / $trace / $copy                    — relations
//     $hide / $deleted / $note                      — review-state meta
//     package "…" <<Frame>> { ... }                 — grouping
//
//   Seed form (friendly paste in Requirements tab):
//     id, name[, type[, text[, hidden[, deleted[, note]]]]]
//     source_id --> target_id[: kind]
//
// The PlantUML preamble (`!procedure` blocks, `hide`, `title`, etc.)
// is tolerated and ignored — same principle as the state-machine
// parser with decorative directives.
//
// Validations (ADR-013 / ADR-014):
//   - $deleted(id, reason): reason MUST be non-empty
//   - seed-form deleted=Y rows MUST have a non-empty note
//   - meta macros ($hide/$deleted/$note) MUST reference a declared id
//   - duplicate requirement ids are rejected
//   - seed-form arrows accept only derive / contain / refine / copy

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
    'hide',
    'deleted',
    'note',
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

// ===== Parser state (function-local, fresh each call) =====

type PendingMeta =
  | { kind: 'hide'; id: string; line: number }
  | { kind: 'deleted'; id: string; reason: string; line: number }
  | { kind: 'note'; id: string; text: string; line: number };

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
    if (reqById.has(r.id)) {
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

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith("'") || trimmed.startsWith('#')) continue;

    const raw = stripInlineComment(trimmed);
    if (raw === '') continue;

    // !procedure ... !endprocedure — swallow
    if (inProcedure) {
      if (/^!endprocedure\b/i.test(raw)) inProcedure = false;
      continue;
    }
    if (/^!procedure\b/i.test(raw)) {
      inProcedure = true;
      continue;
    }

    if (raw.startsWith('@startuml')) {
      inBlock = true;
      continue;
    }
    if (raw.startsWith('@enduml')) {
      inBlock = false;
      continue;
    }
    if (!inBlock) continue;

    // Closing brace ends the current package scope.
    if (raw === '}') {
      if (packageStack.length === 0) {
        errors.push({ line: lineNum, message: 'unmatched closing brace' });
      } else {
        packageStack.pop();
      }
      continue;
    }

    const pkgOpen = raw.match(PACKAGE_OPEN_RE);
    if (pkgOpen) {
      packageStack.push({ name: pkgOpen[1], startLine: lineNum });
      continue;
    }

    if (TOLERATED_RE.test(raw)) continue;

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
            name: displayName,
            text: text ?? null,
            type: REQUIREMENT_MACRO_TO_TYPE[name],
            parentId: currentParent,
            hidden: false,
            deleted: false,
            note: '',
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

      if (name === 'hide') {
        if (args.length !== 1) {
          errors.push({
            line: lineNum,
            message: `$hide expects 1 argument, got ${args.length}`,
          });
          continue;
        }
        pendingMeta.push({ kind: 'hide', id: args[0], line: lineNum });
        continue;
      }
      if (name === 'deleted') {
        if (args.length !== 2) {
          errors.push({
            line: lineNum,
            message: `$deleted expects 2 arguments (id, reason), got ${args.length}`,
          });
          continue;
        }
        const [id, reason] = args;
        if (!reason.trim()) {
          errors.push({
            line: lineNum,
            message: `$deleted('${id}', reason): reason must be non-empty (ADR-014)`,
          });
          continue;
        }
        pendingMeta.push({ kind: 'deleted', id, reason, line: lineNum });
        continue;
      }
      if (name === 'note') {
        if (args.length !== 2) {
          errors.push({
            line: lineNum,
            message: `$note expects 2 arguments (id, text), got ${args.length}`,
          });
          continue;
        }
        pendingMeta.push({
          kind: 'note',
          id: args[0],
          text: args[1],
          line: lineNum,
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
              name: displayName || id,
              text: text && text.trim() !== '' ? text : null,
              type,
              parentId: currentParent,
              hidden,
              deleted,
              note,
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

  // Apply meta macros against declared requirements.
  for (const m of pendingMeta) {
    const r = reqById.get(m.id);
    if (!r) {
      errors.push({
        line: m.line,
        message: `$${m.kind}: unknown requirement id '${m.id}'`,
      });
      continue;
    }
    if (m.kind === 'hide') {
      r.hidden = true;
    } else if (m.kind === 'deleted') {
      r.deleted = true;
      r.note = r.note ? `${r.note}\n${m.reason}` : m.reason;
    } else {
      r.note = r.note ? `${r.note}\n${m.text}` : m.text;
    }
  }

  // $contain second pass: set child.parentId so declaration order doesn't matter.
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
