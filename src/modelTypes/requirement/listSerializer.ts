// SR-113: Requirement list CSV / HTML serializer.
//
// CSV columns (per Requirements_Specification.md §3.13.7):
//
//   id, name, type, text, contained_in, derives_from, hidden, deleted, note
//
// The CSV is also a valid SR-110 seed-form input — round-tripping
// from Save .csv into the Requirements tab of a fresh session restores
// the RequirementModel byte-identically (ADR-011).
//
// HTML form is an equivalent <table> for Excel / Sheets / Word paste,
// mirroring SR-101's split.

import type { Requirement, RequirementModel } from './model';

const CSV_HEADER = [
  'id',
  'name',
  'type',
  'text',
  'contained_in',
  'derives_from',
  'hidden',
  'deleted',
  'note',
];

const TYPE_TO_SEED: Record<Requirement['type'], string> = {
  requirement: 'requirement',
  functionalRequirement: 'functional',
  nonFunctionalRequirement: 'nonfunctional',
  designConstraint: 'constraint',
};

function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function deriveSources(model: RequirementModel, targetId: string): string[] {
  return model.relations
    .filter((r) => r.kind === 'derive' && r.targetId === targetId)
    .map((r) => r.sourceId);
}

export function modelToRequirementsCsv(model: RequirementModel): string {
  const lines: string[] = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of model.requirements) {
    const containedIn = r.parentId ?? '';
    const derivesFrom = deriveSources(model, r.id).join('; ');
    const row = [
      r.id,
      r.name,
      TYPE_TO_SEED[r.type],
      r.text ?? '',
      containedIn,
      derivesFrom,
      r.hidden ? 'Y' : '',
      r.deleted ? 'Y' : '',
      r.note,
    ];
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n');
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function modelToRequirementsHtml(model: RequirementModel): string {
  const header =
    '<thead><tr>' +
    CSV_HEADER.map((h) => `<th>${htmlEscape(h)}</th>`).join('') +
    '</tr></thead>';
  const body =
    '<tbody>' +
    model.requirements
      .map((r) => {
        const containedIn = r.parentId ?? '';
        const derivesFrom = deriveSources(model, r.id).join('; ');
        const deletedStyle = r.deleted
          ? 'text-decoration:line-through;color:#888;'
          : '';
        return (
          `<tr style="${deletedStyle}">` +
          `<th scope="row" style="font-weight:normal;text-align:left;">${htmlEscape(r.id)}</th>` +
          `<td>${htmlEscape(r.name)}</td>` +
          `<td>${htmlEscape(TYPE_TO_SEED[r.type])}</td>` +
          `<td>${htmlEscape(r.text ?? '')}</td>` +
          `<td>${htmlEscape(containedIn)}</td>` +
          `<td>${htmlEscape(derivesFrom)}</td>` +
          `<td style="text-align:center;">${r.hidden ? 'Y' : ''}</td>` +
          `<td style="text-align:center;">${r.deleted ? 'Y' : ''}</td>` +
          `<td>${htmlEscape(r.note)}</td>` +
          '</tr>'
        );
      })
      .join('') +
    '</tbody>';
  return (
    '<table border="1" cellspacing="0" cellpadding="4">' +
    header +
    body +
    '</table>'
  );
}
