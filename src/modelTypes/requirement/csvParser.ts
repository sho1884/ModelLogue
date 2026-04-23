// Parse an SR-113 CSV payload into a RequirementModel.
//
// The canonical CSV shape (per §3.13.7 and listSerializer.ts):
//
//   id, statement, type, text, contained_in, derives_from,
//   hidden, deleted, note
//
// - type is one of: requirement / req / functional / func / nonfunctional /
//   non-functional / nonfunc / non-func / nfunc / constraint / c.
//   Anything else defaults to functionalRequirement.
// - contained_in: single parent id, or empty
// - derives_from: semicolon-separated list of source ids, or empty
// - hidden / deleted: 'Y' / 'y' → true, anything else → false
// - note: free text; required when deleted=Y (ADR-014)
//
// The CSV is the exchange format with the AI (requirement-type sessions,
// v7.5) — the AI sees CSV and returns CSV. Compare: state-machine sees
// and returns PlantUML directly.

import type {
  Requirement,
  RequirementModel,
  RequirementRelation,
  RequirementType,
} from './model';

const TYPE_MAP: Record<string, RequirementType> = {
  requirement: 'requirement',
  req: 'requirement',
  functional: 'functionalRequirement',
  func: 'functionalRequirement',
  nonfunctional: 'nonFunctionalRequirement',
  'non-functional': 'nonFunctionalRequirement',
  nonfunc: 'nonFunctionalRequirement',
  'non-func': 'nonFunctionalRequirement',
  nfunc: 'nonFunctionalRequirement',
  constraint: 'designConstraint',
  c: 'designConstraint',
};

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

export interface CsvParseResult {
  model: RequirementModel | null;
  errors: { line: number; message: string }[];
}

export function parseRequirementsCsv(csvText: string): CsvParseResult {
  const errors: CsvParseResult['errors'] = [];
  const lines = csvText.split(/\r?\n/);

  const requirements: Requirement[] = [];
  const relations: RequirementRelation[] = [];
  const seen = new Set<string>();

  let headerSkipped = false;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    if (raw.trim() === '') continue;
    const cells = parseCsvRow(raw);
    if (cells.length === 0) continue;

    if (
      !headerSkipped &&
      cells[0]?.trim().toLowerCase() === 'id' &&
      (cells[1]?.trim().toLowerCase() === 'statement' ||
        cells[1]?.trim().toLowerCase() === 'name')
    ) {
      headerSkipped = true;
      continue;
    }

    const id = (cells[0] ?? '').trim();
    if (id === '') continue;
    if (seen.has(id)) {
      errors.push({ line: li + 1, message: `duplicate id '${id}'` });
      continue;
    }
    seen.add(id);

    const statement = (cells[1] ?? '').trim() || id;
    const typeRaw = (cells[2] ?? '').trim().toLowerCase();
    const type = typeRaw === '' ? 'functionalRequirement' : TYPE_MAP[typeRaw];
    if (!type) {
      errors.push({
        line: li + 1,
        message: `unknown type '${cells[2]}' — accepted: functional / nonfunctional / constraint / requirement`,
      });
      continue;
    }

    const text = cells[3] && cells[3].trim() !== '' ? cells[3] : null;
    const containedIn = (cells[4] ?? '').trim();
    const derivesFrom = (cells[5] ?? '').trim();
    const hidden = (cells[6] ?? '').trim().toUpperCase() === 'Y';
    const deleted = (cells[7] ?? '').trim().toUpperCase() === 'Y';
    const note = cells[8] ?? '';

    if (deleted && note.trim() === '') {
      errors.push({
        line: li + 1,
        message: `row '${id}' has deleted=Y but empty note; a reason is required (ADR-014)`,
      });
      continue;
    }

    requirements.push({
      id,
      statement,
      text,
      type,
      parentId: containedIn === '' ? null : containedIn,
      hidden,
      deleted,
      note,
    });

    if (containedIn !== '') {
      relations.push({
        sourceId: containedIn,
        targetId: id,
        kind: 'contain',
      });
    }
    if (derivesFrom !== '') {
      for (const src of derivesFrom
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        relations.push({ sourceId: src, targetId: id, kind: 'derive' });
      }
    }
  }

  if (requirements.length === 0 && errors.length === 0) {
    return { model: null, errors };
  }

  return { model: { requirements, relations }, errors };
}
