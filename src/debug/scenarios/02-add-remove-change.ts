import type { Scenario } from './types';

// Exercises diff-overlay placement for each kind of change (added,
// removed, guard-changed) and verifies summary counts match frames.

const STEP1 = `@startuml
[*] --> Todo
Todo --> InProgress : start
InProgress --> Done : finish
Done --> [*]
@enduml`;

const STEP2 = `@startuml
[*] --> Todo
Todo --> InProgress : start
Todo --> Cancelled : cancel
InProgress --> Done : finish
InProgress --> Cancelled : cancel
Done --> [*]
Cancelled --> [*]
@enduml`;

const STEP3 = `@startuml
[*] --> Todo
Todo --> InProgress : start
Todo --> Cancelled : cancel
InProgress --> Cancelled : cancel
InProgress --> [*] : finish
Cancelled --> [*]
@enduml`;

const STEP4 = `@startuml
[*] --> Todo
Todo --> InProgress : start [ready]
Todo --> Cancelled : cancel
InProgress --> Cancelled : cancel
InProgress --> [*] : finish
Cancelled --> [*]
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '02-add-remove-change',
  label: 'ノード追加・削除・変更',
  description:
    '追加（Cancelled） → 削除（Done） → 変更（guard 追加）の順で apply。緑/赤/橙の枠の位置、件数一致、current / proposed 両側の配置を検証。',
  requirementsText: 'タスク管理の基本ステート。追加・削除・変更を段階的に観察する。',
  steps: [
    {
      userMessage: '初版モデルを作ってください。(scenario 02 step 1)',
      mockReplies: [{ text: '初版です。' + wrap(STEP1), suggestedSource: STEP1 }],
      pauseMs: 2500,
      note: '初版 (auto-apply): Todo / InProgress / Done',
    },
    {
      userMessage: 'Cancelled 状態を追加してください。',
      mockReplies: [
        {
          text: 'Cancelled を追加しました。' + wrap(STEP2),
          suggestedSource: STEP2,
        },
      ],
      pauseMs: 3000,
      note: 'Added: proposed 側に緑枠が 1 つ',
    },
    {
      userMessage: 'Done は不要なので取り除いてください。',
      mockReplies: [
        { text: 'Done を削除しました。' + wrap(STEP3), suggestedSource: STEP3 },
      ],
      pauseMs: 3000,
      note: 'Removed: current 側に赤枠が 1 つ',
    },
    {
      userMessage: 'Todo → InProgress に guard [ready] を付けてください。',
      mockReplies: [
        { text: 'guard を付けました。' + wrap(STEP4), suggestedSource: STEP4 },
      ],
      pauseMs: 3000,
      note: 'Changed: 両側に橙枠が 1 つ (遷移変更は state の変更ではないので枠はつかない想定 — 件数のみ)',
    },
  ],
};

export default scenario;
