import type { Scenario } from './types';

// Loads a small, clean state machine so the reviewer can watch the
// Test cases tab react to the N=0 / N=1 / N=2 selector and to the
// View: Tests / Coverage toggle.
//
// Target: SR-103 (reactive display) + SR-102 (Copy / Save with view
// toggle). Rich enough that N=0 / N=1 / N=2 all produce meaningfully
// different numbers (~5 transitions → ~5 / ~7 / ~9+ required chains),
// small enough that the table fits on screen.

const SOURCE = `@startuml
hide empty description
[*] --> Idle
Idle --> Active : start
Active --> Paused : pause
Paused --> Active : resume
Active --> Idle : stop
Active --> [*] : done
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '04-nswitch-levels',
  label: 'N-switch レベル切替（0/1/2）',
  description:
    '小さいモデルを 1 回だけ load して Apply する。そのあと Test cases タブで N=0 / N=1 / N=2 を切り替えて件数が増えていく様子、View: Tests / Coverage トグルで表示が入れ替わる様子、Copy / Save で正規 CSV が出ることを目視確認する。',
  requirementsText:
    'N-switch 切替の素材モデル。5 遷移 + 1 循環。N=0 は全遷移、N=1 はペア、N=2 はトリプルが要求チェーンとして列挙される。',
  steps: [
    {
      userMessage:
        '初版として、Idle / Active / Paused の 3 状態からなるシンプルなステートマシンを作ってください。',
      mockReplies: [
        {
          text: 'N-switch 観察用のモデルです。' + wrap(SOURCE),
          suggestedSource: SOURCE,
        },
      ],
      pauseMs: 2500,
      note: 'Apply 後、Test cases タブで N=0/1/2 と View トグルを手動で確認',
    },
  ],
};

export default scenario;
