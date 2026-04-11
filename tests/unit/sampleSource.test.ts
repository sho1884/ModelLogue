import { describe, it, expect } from 'vitest';
import { parse } from '../../src/parsers/stateMachineParser';

// Sanity check that the sample source shipped in sessionStore parses cleanly.
const SAMPLE_SOURCE = `@startuml
state "AIに自動生成を依頼" as AIGenerate
state "人間が手動で記述" as HumanWrite
state "初版モデルの完成" as Drafted
state "モデルの確認・マーカー配置" as Inspecting
state "AIへの質問・指示" as Asking
state "AIからの回答・修正提案" as Answering
state "モデルの修正・更新" as Editing
state "合意形成（完了）" as Agreed
state "モデル修正保留" as Postponed
state "要求仕様の不備発覚" as SpecIssue

[*] --> AIGenerate : 要求仕様＋文法ルール [AIに任せる]
[*] --> HumanWrite : 要求仕様＋文法ルール [自分で書く]

AIGenerate --> Drafted
HumanWrite --> Drafted

Drafted --> Inspecting

Inspecting --> Asking : 気になる点がある
Asking --> Answering
Answering --> Editing : 提案を受け入れる
Editing --> Inspecting

Inspecting --> Agreed : 指摘がすべて解消された
Inspecting --> Postponed : 修正案がまとまらない
Inspecting --> SpecIssue : 仕様側の矛盾・漏れ等に気づいた

Agreed --> [*]
Postponed --> [*]
SpecIssue --> [*]
@enduml`;

describe('sample source (ModelLogue review process)', () => {
  it('parses without errors', () => {
    const result = parse(SAMPLE_SOURCE);
    expect(result.errors).toEqual([]);
  });

  it('contains all expected normal states', () => {
    const result = parse(SAMPLE_SOURCE);
    const normalStates = result.model!.states.filter((s) => s.type === 'normal');
    const ids = normalStates.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        'AIGenerate',
        'HumanWrite',
        'Drafted',
        'Inspecting',
        'Asking',
        'Answering',
        'Editing',
        'Agreed',
        'Postponed',
        'SpecIssue',
      ].sort()
    );
  });

  it('preserves Japanese labels', () => {
    const result = parse(SAMPLE_SOURCE);
    const drafted = result.model!.states.find((s) => s.id === 'Drafted');
    expect(drafted?.label).toBe('初版モデルの完成');
  });

  it('classifies pseudo-states (initial and final exist)', () => {
    const result = parse(SAMPLE_SOURCE);
    const initial = result.model!.states.find((s) => s.type === 'initial');
    const final = result.model!.states.find((s) => s.type === 'final');
    expect(initial).toBeDefined();
    expect(final).toBeDefined();
  });

  it('parses the guard on the initial transitions', () => {
    const result = parse(SAMPLE_SOURCE);
    const t = result.model!.transitions.find(
      (t) => t.targetStateId === 'AIGenerate'
    );
    expect(t).toBeDefined();
    expect(t!.guard).toBe('AIに任せる');
  });
});
