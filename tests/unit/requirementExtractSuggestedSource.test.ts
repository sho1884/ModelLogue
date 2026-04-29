import { describe, it, expect } from 'vitest';
import { requirementDefinition } from '../../src/modelTypes/requirement/definition';
import { parse } from '../../src/modelTypes/requirement/parser';

function wrapCsv(csv: string): string {
  return '```csv\n' + csv + '\n```';
}

describe('requirementDefinition.extractSuggestedSource', () => {
  it('extracts a ```csv block and regenerates PlantUML', () => {
    const ai = `Here is the updated list.\n\n${wrapCsv(
      `R1,light up,functional,,,,,,,,\nR2,emit,functional,,R1,,,,,,`
    )}\n\nDone.`;
    const puml = requirementDefinition.extractSuggestedSource!(ai, '');
    expect(puml).not.toBeNull();
    expect(puml).toContain('@startuml');
    expect(puml).toContain('$fReq("R1", "light up")');
    const { model, errors } = parse(puml!);
    expect(errors).toEqual([]);
    expect(model?.requirements.map((r) => r.id)).toEqual(['R1', 'R2']);
  });

  it('returns null when no csv block is present', () => {
    const puml = requirementDefinition.extractSuggestedSource!(
      'Just prose, no code block.',
      ''
    );
    expect(puml).toBeNull();
  });

  it('returns null when the csv block fails to parse', () => {
    const ai = wrapCsv(`R1,gone,functional,,,,,Y,,,`); // deleted=Y with empty note
    const puml = requirementDefinition.extractSuggestedSource!(ai, '');
    expect(puml).toBeNull();
  });

  it('accepts a csv block that includes the canonical header row', () => {
    const csv =
      'id,statement,type,text,contained_in,derives_from,hidden,deleted,note,level,group\n' +
      'R1,light up,functional,,,,,,,,';
    const puml = requirementDefinition.extractSuggestedSource!(wrapCsv(csv), '');
    expect(puml).toContain('$fReq("R1", "light up")');
  });
});
