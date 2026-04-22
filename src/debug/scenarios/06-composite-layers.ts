import type { Scenario } from './types';

// Loads a one-level composite state model. The nswitch layered strategy
// (tools/nswitch/Requirements_Specification.md §7.1) then emits two
// independent test groups: one for the composed "top" machine and one
// per composite — here, just `Operating`. Test ids in the table show
// the `top-NNN` / `Operating-NNN` split.
//
// Target: SR-103 (status line shows "N tests across 2 layers") and the
// Coverage view (test_id columns include both layers).

const SOURCE = `@startuml
hide empty description
[*] --> Idle
Idle --> Operating : start
state Operating {
  [*] --> Running
  Running --> Paused : pause
  Paused --> Running : resume
}
Operating --> Idle : stop
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '06-composite-layers',
  label: '複合状態のレイヤ分解',
  description:
    '1 階層の複合状態 Operating を含むモデル。Test cases タブのテーブルには top レイヤと Operating レイヤのテストが test_id で識別できる形で並び、Coverage ビューの列ヘッダにも両レイヤの test_id が並ぶ。ADR-009 の 1 階層制約の恩恵を目視確認。',
  requirementsText:
    '複合状態 Operating に Running / Paused の子状態を持つデモ。nswitch は top と Operating の 2 レイヤに分解してテスト生成する。',
  steps: [
    {
      userMessage:
        '初版として、Idle → Operating（中に Running / Paused の 2 子状態、pause/resume で遷移） → Idle というモデルを作ってください。Operating は 1 階層の複合状態として記述してください。',
      mockReplies: [
        {
          text: '複合状態付きのモデルです。' + wrap(SOURCE),
          suggestedSource: SOURCE,
        },
      ],
      pauseMs: 2500,
      note: 'Apply 後、test_id の top-NNN と Operating-NNN の両系統が出る',
    },
  ],
};

export default scenario;
