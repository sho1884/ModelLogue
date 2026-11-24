import { describe, it, expect } from 'vitest';
import { parse } from '../../src/modelTypes/state-machine/parser';

// Sanity check that a representative sample (ModelLogue's own review
// process) parses cleanly.
// The sample uses one-level composite states per ADR-009.
const SAMPLE_SOURCE = `@startuml
state "初版生成" as InitialGeneration {
  [*] --> AIGenerate
  state "AIに自動生成を依頼" as AIGenerate
  state "人間が手動で記述" as HumanWrite
  state "初版モデルの完成" as Drafted
  AIGenerate --> Drafted
  HumanWrite --> Drafted
}

state "レビューループ" as ReviewLoop {
  [*] --> Inspecting
  state "モデルの確認・マーカー配置" as Inspecting
  state "AIへの質問・指示" as Asking
  state "AIからの回答・修正提案" as Answering
  state "モデルの修正・更新" as Editing

  Inspecting --> Asking : 気になる点がある
  Asking --> Answering
  Answering --> Editing : 提案を受け入れる
  Editing --> Inspecting
}

state "合意形成" as Agreed
state "モデル修正保留" as Postponed
state "要求仕様の不備発覚" as SpecIssue

[*] --> InitialGeneration
InitialGeneration --> ReviewLoop

ReviewLoop --> Agreed : 指摘がすべて解消された
ReviewLoop --> Postponed : 修正案がまとまらない
ReviewLoop --> SpecIssue : 仕様側の矛盾・漏れ等に気づいた

Agreed --> [*]
Postponed --> [*]
SpecIssue --> [*]
@enduml`;

describe('sample source (ModelLogue review process)', () => {
  it('parses without errors', () => {
    const result = parse(SAMPLE_SOURCE);
    expect(result.errors).toEqual([]);
  });

  it('has two composite states (InitialGeneration and ReviewLoop)', () => {
    const result = parse(SAMPLE_SOURCE);
    const composites = result.model!.states.filter(
      (s) => s.type === 'composite'
    );
    const ids = composites.map((s) => s.id).sort();
    expect(ids).toEqual(['InitialGeneration', 'ReviewLoop']);
  });

  it('places child states under their parent composite', () => {
    const result = parse(SAMPLE_SOURCE);

    const aiGenerate = result.model!.states.find((s) => s.id === 'AIGenerate');
    expect(aiGenerate?.parentId).toBe('InitialGeneration');

    const inspecting = result.model!.states.find((s) => s.id === 'Inspecting');
    expect(inspecting?.parentId).toBe('ReviewLoop');

    const agreed = result.model!.states.find((s) => s.id === 'Agreed');
    expect(agreed?.parentId).toBeNull(); // top-level sibling
  });

  it('recognizes the group-escape transitions from ReviewLoop', () => {
    const result = parse(SAMPLE_SOURCE);

    const toAgreed = result.model!.transitions.find(
      (t) =>
        t.sourceStateId === 'ReviewLoop' && t.targetStateId === 'Agreed'
    );
    expect(toAgreed).toBeDefined();
    expect(toAgreed!.event).toBe('指摘がすべて解消された');
  });

  it('preserves Japanese labels', () => {
    const result = parse(SAMPLE_SOURCE);
    const drafted = result.model!.states.find((s) => s.id === 'Drafted');
    expect(drafted?.label).toBe('初版モデルの完成');

    const reviewLoop = result.model!.states.find(
      (s) => s.id === 'ReviewLoop'
    );
    expect(reviewLoop?.label).toBe('レビューループ');
  });

  it('contains internal initial pseudo-states for each composite', () => {
    const result = parse(SAMPLE_SOURCE);

    const initGen = result.model!.states.find(
      (s) => s.id === '__start_of_InitialGeneration__'
    );
    expect(initGen).toBeDefined();
    expect(initGen!.type).toBe('initial');
    expect(initGen!.parentId).toBe('InitialGeneration');

    const reviewLoopInit = result.model!.states.find(
      (s) => s.id === '__start_of_ReviewLoop__'
    );
    expect(reviewLoopInit).toBeDefined();
    expect(reviewLoopInit!.type).toBe('initial');
    expect(reviewLoopInit!.parentId).toBe('ReviewLoop');
  });
});
