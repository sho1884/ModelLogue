import type { Scenario } from './types';

// Exercises the review-oriented tabs side-by-side:
//  - Step 1: initial simple linear flow — Scenarios has 1 path,
//    Events/Roles/Artifacts/Externals empty.
//  - Step 2: AI expands into a branching flow with a timer event,
//    introduces a 2nd lane, and adds arrow labels (伝票) — most
//    tasks are new (green), tasks that stayed the same are
//    unchanged, Scenarios jumps to several paths, Events/Roles/
//    Artifacts populate.
//  - Step 3: AI attaches `**外部:** 名前` note annotations to
//    the surviving tasks — those tasks are CHANGED (their
//    externalReferences set is non-empty now) → orange markers.
//    Externals tab populates.

function wrap(src: string): string {
  return '```plantuml\n' + src + '\n```';
}

const STEP1 = `@startuml
title ローン申込処理

|営業担当|
start
:申込書を受付;
:申込内容を確認;
:受付完了通知;
stop
@enduml`;

const STEP2 = `@startuml
title ローン申込処理

|営業担当|
start
:申込書を受付;
-> 申込書;
:申込内容を確認;
-> 審査票;
|審査員|
:書類内容を審査;
:承認待ち;<<timer>>
if (期限内に応答?) then (yes)
  :与信を判定;
  if (承認?) then (承認)
    |営業担当|
    :承認通知を送付;
    -> 承認通知;
    stop
  else (却下)
    |営業担当|
    :却下通知を送付;
    -> 却下通知;
    stop
  endif
else (no)
  :タイムアウトをエスカレーション;<<error>>
  stop
endif
@enduml`;

const STEP3 = `@startuml
title ローン申込処理

|営業担当|
start
:申込書を受付;
note right
**外部:** 申込受付フォーム
end note
-> 申込書;
:申込内容を確認;
note right
**外部:** 申込マスタDB
end note
-> 審査票;
|審査員|
:書類内容を審査;
note right
**外部:** 申込マスタDB
**外部:** 与信照会API
end note
:承認待ち;<<timer>>
if (期限内に応答?) then (yes)
  :与信を判定;
  note right
  **外部:** 与信照会API
  end note
  if (承認?) then (承認)
    |営業担当|
    :承認通知を送付;
    note right
    **外部:** 通知メール配信API
    end note
    -> 承認通知;
    stop
  else (却下)
    |営業担当|
    :却下通知を送付;
    note right
    **外部:** 通知メール配信API
    end note
    -> 却下通知;
    stop
  endif
else (no)
  :タイムアウトをエスカレーション;<<error>>
  note right
  **外部:** 監視基盤
  end note
  stop
endif
@enduml`;

const scenario: Scenario = {
  id: '11-process-realistic-review',
  label: 'Process: 実務レビュー一連（分岐・イベント・外部系）',
  description:
    '初期 3 タスク → 分岐・レーン・イベント追加（緑+オレンジ混在、Scenarios 多数化） → 外部システム注釈付け（オレンジ）。Events/Roles/Artifacts/Externals 全タブが途中から埋まる様子を確認する。',
  modelTypeId: 'process',
  requirementsText:
    'ローン申込処理。営業担当が受け付け、審査員が書類確認と与信判定を行う。承認・却下の通知を営業担当が出す。応答がタイムアウトしたら監視基盤にエスカレーション。' +
    ' なお申込受付フォーム / 申込マスタDB / 与信照会API / 通知メール配信API / 監視基盤 は本プロジェクトで設計・改修の対象としない**外部**システム扱いとする。',
  steps: [
    {
      userMessage:
        'ローン申込処理の最初の骨子を作ってください。(scenario 11 step 1)',
      mockReplies: [
        {
          text: 'まずは受付〜受付通知の線形フローです。\n\n' + wrap(STEP1),
        },
      ],
      pauseMs: 3000,
      note: '初期: 3 タスク、Scenarios 1 件',
    },
    {
      userMessage:
        '審査員が書類を確認して与信判定を行う分岐を追加してください。タイムアウト時は監視基盤にエスカレーションします。',
      mockReplies: [
        {
          text:
            '審査員レーン、承認待ちタイマー、承認／却下分岐、タイムアウトエスカレーションを追加しました。\n\n' +
            wrap(STEP2),
        },
      ],
      pauseMs: 3500,
      note: '拡張: 新規タスクに緑、申込内容を確認は incomingLabel 追加でオレンジ',
    },
    {
      userMessage:
        '各タスクが触る外部システムやリポジトリを note で明記してください。',
      mockReplies: [
        {
          text:
            '関連する外部 IT 要素を付箋で注釈しました。\n\n' + wrap(STEP3),
        },
      ],
      pauseMs: 3500,
      note: '注釈: 外部参照が付いたタスクは externalReferences が変わりオレンジ',
    },
  ],
};

export default scenario;
