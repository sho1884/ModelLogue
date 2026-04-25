import type { Scenario } from './types';

// Exercises the basic process-type apply path with auto-markers:
//  - Step 1: initial 3-task linear generation — no markers (first
//    apply of a process session starts from an empty buffer-of-
//    tasks; the stash gate skips auto-markers here so the whole
//    diagram does not paint green).
//  - Step 2: AI adds a new task between existing ones — GREEN
//    marker on the new task, nothing else changed.
//  - Step 3: AI moves an existing task to a different lane
//    (label unchanged, lane differs) — ORANGE marker on that task.
//
// Scenarios tab should populate with 1 row (linear) at every step
// since none of the changes introduce branches.

function wrap(src: string): string {
  return '```plantuml\n' + src + '\n```';
}

const STEP1 = `@startuml
title 申込処理

|受付係|
start
:申込書を受付;
:入力チェック;
:受付完了を記録;
stop
@enduml`;

const STEP2 = `@startuml
title 申込処理

|受付係|
start
:申込書を受付;
:入力チェック;
:受付完了メールを送信;
:受付完了を記録;
stop
@enduml`;

const STEP3 = `@startuml
title 申込処理

|受付係|
start
:申込書を受付;
|審査係|
:入力チェック;
|受付係|
:受付完了メールを送信;
:受付完了を記録;
stop
@enduml`;

const scenario: Scenario = {
  id: '10-process-apply-basics',
  label: 'Process: 初期生成 → 追加 → レーン変更',
  description:
    'プロセス図セッションでの基本 apply パス確認: 初期 3 タスク生成（マーカーなし） → タスク追加（緑） → 既存タスクのレーン変更（オレンジ）。Scenarios タブも step ごとに更新される。',
  modelTypeId: 'process',
  requirementsText:
    '申込を受け付けて入力を確認し、完了を記録する一連の処理。最初は受付係だけで回すが、将来的には審査係と連携する。',
  steps: [
    {
      userMessage:
        '受付〜受付完了までの業務プロセス図を作ってください。(scenario 10 step 1)',
      mockReplies: [
        {
          text:
            '受付係の一連のタスクを並べました。\n\n' + wrap(STEP1),
        },
      ],
      pauseMs: 2500,
      note: '初期生成: 3 タスク、マーカーなし',
    },
    {
      userMessage:
        '入力チェックの後に、申込者へ受付完了メールを送るタスクを追加してください。',
      mockReplies: [
        {
          text:
            '受付完了メール送信を追加しました。\n\n' + wrap(STEP2),
        },
      ],
      pauseMs: 2500,
      note: '追加: 受付完了メールを送信 のみ緑（added）',
    },
    {
      userMessage:
        '入力チェックは受付係ではなく審査係の業務にしてください。',
      mockReplies: [
        {
          text:
            '入力チェックを審査係のレーンに移しました。\n\n' + wrap(STEP3),
        },
      ],
      pauseMs: 2500,
      note: 'レーン変更: 入力チェック のみオレンジ（changed、lane が変わった）',
    },
  ],
};

export default scenario;
