import type { Scenario } from './types';

// Loads a mainloop-style state machine that has no `[*]_final`. The
// nswitch builder falls back from final-reaching paths to cycle closure
// (tools/nswitch/Requirements_Specification.md §7.4 step 1), so every
// generated test terminates on a revisited regular state — `end` is
// something like `Ready` instead of `[*]_final`.
//
// Target: SR-103 table — look at the `end` column for non-[*]_final
// ids, and at the test sequences that trail off through a repeat.

const SOURCE = `@startuml
hide empty description
[*] --> Idle
Idle --> Ready : boot
Ready --> Running : start
Running --> Ready : tick
Running --> Error : fault
Error --> Ready : recover
@enduml`;

function wrap(source: string): string {
  return '```plantuml\n' + source + '\n```';
}

const scenario: Scenario = {
  id: '07-mainloop-cycle-closure',
  label: 'Mainloop（終了なし）— サイクルクロージャ',
  description:
    '[*]_final を持たない mainloop 型モデル。nswitch は cycle closure にフォールバックして、再訪した状態でテストを閉じる。Test cases タブの end 列が [*]_final ではなく通常状態になるのが観察できる。組み込みのイベントループ系モデルでよくある形。',
  requirementsText:
    '終了状態を持たない mainloop モデル。Idle → Ready → Running を中心に、一時的な Error から復帰して再び Ready に戻るループ。テストはサイクルが閉じる時点で終了する。',
  steps: [
    {
      userMessage:
        '初版として、終了状態を持たない mainloop 型のステートマシンを作ってください。Idle → Ready → Running を中心に、Error が入っても Ready に復帰するようにします。',
      mockReplies: [
        {
          text: 'mainloop 型モデルです（終了なし）。' + wrap(SOURCE),
          suggestedSource: SOURCE,
        },
      ],
      pauseMs: 2500,
      note: 'Apply 後、end 列に [*]_final ではない状態（Ready など）が並ぶ',
    },
  ],
};

export default scenario;
