import type { Scenario } from './types';

// Exercises: composite-state handling and auto-reask on EBNF violation.

const STEP1 = `@startuml
[*] --> Idle
Idle --> Running : start
Running --> Idle : stop
Running --> [*]
@enduml`;

const STEP2 = `@startuml
state Operating {
  [*] --> Running
  Running --> Paused : pause
  Paused --> Running : resume
}
[*] --> Idle
Idle --> Operating : start
Operating --> Idle : stop
Operating --> [*]
@enduml`;

// Step 3's FIRST reply contains a history pseudo-state [H], which the
// parser rejects. sendAndAutoReask should auto-post a follow-up user
// message and consume the NEXT reply from the queue.
const STEP3_BAD = `@startuml
state Operating {
  [*] --> Running
  Running --> Paused : pause
  Paused --> Running : resume
  [H] --> Running
}
[*] --> Idle
Idle --> Operating : start
Operating --> Idle : stop
Operating --> [*]
@enduml`;

const STEP3_OK = `@startuml
state Operating {
  [*] --> Running
  Running --> Paused : pause
  Paused --> Running : resume
}
state Saved
[*] --> Idle
Idle --> Operating : start
Operating --> Idle : stop
Operating --> Saved
Saved --> [*]
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '03-composite-and-reask',
  label: '複合状態 + auto-reask',
  description:
    'フラットモデル → 複合状態を導入 → EBNF違反の応答 → 自動再要求で修正版に到達。複合描画と auto-reask ループを検証。',
  requirementsText:
    'ストップウォッチ風のデモ。複合状態とヒストリ疑似状態で、文法違反からの自動復帰を確認する。',
  steps: [
    {
      userMessage: '初版モデルを作ってください。(scenario 03 step 1)',
      mockReplies: [{ text: wrap(STEP1), suggestedSource: STEP1 }],
      pauseMs: 2500,
      note: '初版 (auto-apply): フラット 2 状態',
    },
    {
      userMessage:
        'Running と Paused をまとめた Operating 複合状態にしてください。',
      mockReplies: [{ text: wrap(STEP2), suggestedSource: STEP2 }],
      pauseMs: 3500,
      note: '複合状態追加: 差分件数は filter で normal のみ、子の変化が見える',
    },
    {
      userMessage: '再開時の履歴状態も追加してください。',
      mockReplies: [
        {
          text: 'では [H] を使って履歴を復元します。' + wrap(STEP3_BAD),
          suggestedSource: STEP3_BAD,
        },
        // Second reply: the auto-reask follow-up consumes this.
        {
          text:
            '失礼しました、subset の範囲で書き直します。' + wrap(STEP3_OK),
          suggestedSource: STEP3_OK,
        },
      ],
      pauseMs: 4500,
      note: 'EBNF 違反 → auto-reask → 修正版。チャットに 2 往復分が残る',
    },
  ],
};

export default scenario;
