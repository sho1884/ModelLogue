import type { Scenario } from './types';

// Loads a model with a disconnected component (two states that are not
// reachable from the initial pseudo-state). The coverage engine reports
// every required chain anchored in that component as
// `unreachable-within-cap`, because no path exists from init to the
// chain head within the cycle-unroll budget (see
// tools/nswitch/Requirements_Specification.md §7.4).
//
// Target: SR-103 (uncovered banner above the table) + SR-102 (coverage
// view — amber status / reason columns). This is a common real-world
// modeling mistake: a state that never gets a way in. Making it
// human-visible here turns nswitch into a review aid, not just a test
// generator.

const SOURCE = `@startuml
hide empty description
[*] --> Main
Main --> Working : start
Working --> Done : finish
Done --> [*] : cleanup
Stray --> Forgotten : bang
Forgotten --> Main : kick
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '05-unreachable-within-cap',
  label: 'Unreachable — 到達不能状態の検出',
  description:
    '初期から到達できない disconnected component (Stray / Forgotten) を含むモデル。Test cases タブ上部に黄色の "uncovered" バナーが出て、View: Coverage に切り替えると amber でハイライトされた status=unreachable-within-cap の行が並ぶ。モデリング漏れの早期発見に使える。',
  requirementsText:
    '到達不能状態を含むモデルのデモ。Stray / Forgotten の 2 状態は [*] から一度も到達できないので、それらを含む要求チェーンはすべて uncovered として報告される。',
  steps: [
    {
      userMessage:
        '初版として、Main から開始して Working → Done → cleanup の流れを持つモデルを作ってください。ただし、リカバリ用の状態として Stray と Forgotten も宣言しておいてください（まだ本線には繋がなくて結構です）。',
      mockReplies: [
        {
          text:
            '到達不能な Stray / Forgotten も含めたモデルです。' + wrap(SOURCE),
          suggestedSource: SOURCE,
        },
      ],
      pauseMs: 2500,
      note:
        'Apply 後、Test cases タブに黄色バナー（uncovered N chains）と Coverage ビューの amber 行が出ることを確認',
    },
  ],
};

export default scenario;
