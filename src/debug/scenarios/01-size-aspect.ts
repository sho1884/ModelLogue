import type { Scenario } from './types';

// Exercises dramatic canvas aspect flips between Apply cycles:
//  - Step 1: tall / narrow  (default top-to-bottom layout, long chain)
//  - Step 2: short / wide   (`left to right direction` flips orientation,
//                            plus more states to push horizontal length)
//  - Step 3: roughly square (branching diamond)
// Verifies DiagramView auto-fit re-fires on size change (SR-070), that
// the pane's dashed rectangle re-sizes to each model, and that the
// before/after proposal view scales correctly when aspects differ.

const STEP1_TALL = `@startuml
hide empty description
[*] --> A
A --> B : go
B --> C : next
C --> D : then
D --> E : again
E --> F : more
F --> [*]
@enduml`;

const STEP2_WIDE = `@startuml
hide empty description
left to right direction
[*] --> A
A --> B : go
B --> C : next
C --> D : then
D --> E : again
E --> F : more
F --> G : continue
G --> H : finally
H --> [*]
@enduml`;

const STEP3_SQUARE = `@startuml
hide empty description
[*] --> A
A --> B : e1
A --> C : e2
B --> D : e3
C --> D : e4
D --> [*]
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '01-size-aspect',
  label: 'サイズ・縦横比の変化',
  description:
    '縦長チェーン → 横長 (left to right) → 正方形に近い分岐 の順で apply。DiagramView の auto-fit、ペーンの破線枠サイズ追従、ProposalView / Modal のスケール一致をアスペクト比の大きな反転で検証する。',
  requirementsText:
    'デモ用の連続ワークフロー。同じ題材を縦・横・分岐の異なるレイアウトで表現し、モデル図のサイズと縦横比の大きな変化に UI が追随するかを確認する。',
  steps: [
    {
      userMessage:
        '初版として、縦にまっすぐ並ぶチェーン状のステートマシンを作ってください。(scenario 01 step 1)',
      mockReplies: [
        { text: '縦長のチェーンです。' + wrap(STEP1_TALL), suggestedSource: STEP1_TALL },
      ],
      pauseMs: 2500,
      note: '縦長 (top-to-bottom chain, 6 states)',
    },
    {
      userMessage:
        'いまのモデルを横方向に並ぶ形に組み替えて、状態を 2 つ追加してください。',
      mockReplies: [
        { text: '横長に組み替えました。' + wrap(STEP2_WIDE), suggestedSource: STEP2_WIDE },
      ],
      pauseMs: 2500,
      note: '横長 (left to right, 8 states) — アスペクト比が大きく反転',
    },
    {
      userMessage:
        '最後に、分岐して合流するダイヤモンド形のシンプルな構造にしてください。',
      mockReplies: [
        { text: '分岐・合流型です。' + wrap(STEP3_SQUARE), suggestedSource: STEP3_SQUARE },
      ],
      pauseMs: 2500,
      note: '正方形に近い分岐構造',
    },
  ],
};

export default scenario;
