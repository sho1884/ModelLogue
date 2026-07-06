import { describe, it, expect } from 'vitest';
import { extractPlantUmlBlock } from '../../src/services/n8nService';

const DIAGRAM = '@startuml\n[*] --> Idle\nIdle --> Active : start\n@enduml';

describe('extractPlantUmlBlock (robust proposal extraction)', () => {
  it('extracts a ```plantuml fenced block', () => {
    const text = `Here you go:\n\n\`\`\`plantuml\n${DIAGRAM}\n\`\`\``;
    expect(extractPlantUmlBlock(text)).toBe(DIAGRAM);
  });

  it('extracts a ```puml / ```uml tagged block', () => {
    expect(extractPlantUmlBlock('\`\`\`puml\n' + DIAGRAM + '\n\`\`\`')).toBe(DIAGRAM);
    expect(extractPlantUmlBlock('\`\`\`uml\n' + DIAGRAM + '\n\`\`\`')).toBe(DIAGRAM);
  });

  it('extracts an untagged ``` fence whose body is a diagram', () => {
    const text = 'text\n\`\`\`\n' + DIAGRAM + '\n\`\`\`';
    expect(extractPlantUmlBlock(text)).toBe(DIAGRAM);
  });

  it('extracts a BARE @startuml…@enduml block with no fence (the reported case)', () => {
    const text = `以下がモデルです。\n${DIAGRAM}\nご確認ください。`;
    expect(extractPlantUmlBlock(text)).toBe(DIAGRAM);
  });

  it('returns undefined when there is no diagram', () => {
    expect(extractPlantUmlBlock('Just a plain reply, no model.')).toBeUndefined();
  });
});
