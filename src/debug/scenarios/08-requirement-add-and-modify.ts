import type { Scenario } from './types';

// Exercises the requirement-type apply path:
//  - Step 1: initial generation — AI emits the SR-113 CSV for a
//    flashlight spec. No markers (initial).
//  - Step 2: modify R1's statement — orange (changed) marker on R1.
//  - Step 3: add a battery non-functional requirement Q1 — green
//    (added) marker on Q1.
//
// All replies are CSV blocks; the requirement ModelTypeDefinition
// parses the CSV and regenerates PlantUML mechanically, so the edit
// buffer is still valid PlantUML the whole way through.

function wrapCsv(csv: string): string {
  return '```csv\n' + csv + '\n```';
}

const HEADER =
  'id,statement,type,text,contained_in,derives_from,hidden,deleted,note,level,group';

const STEP1 = [
  HEADER,
  'R1,光を出す,functional,,,,,,,,',
  'R2,周囲を明るくする,functional,,,R1,,,,,',
  'C1,屋外でも使える,constraint,,,,,,,,',
].join('\n');

const STEP2 = [
  HEADER,
  // R1's statement changed — should trigger the orange marker.
  'R1,周囲を明るくする光を出す,functional,,,,,,,,',
  'R2,周囲を明るくする,functional,,,R1,,,,,',
  'C1,屋外でも使える,constraint,,,,,,,,',
].join('\n');

const STEP3 = [
  HEADER,
  'R1,周囲を明るくする光を出す,functional,,,,,,,,',
  'R2,周囲を明るくする,functional,,,R1,,,,,',
  'C1,屋外でも使える,constraint,,,,,,,,',
  // Newly added NFR — should trigger the green marker.
  'Q1,頻繁にバッテリを交換したくない,nonfunctional,,,,,,,,',
].join('\n');

const scenario: Scenario = {
  id: '08-requirement-add-and-modify',
  label: 'Requirement: 初期生成 → 書き換え → 追加',
  description:
    '要求図セッションで CSV 応答を連続 apply。初期生成（枠なし）→ 既存要求の書き換え（オレンジ枠）→ 新規要求の追加（緑枠）の順で、自動マーカーの色と対象が期待通りかを目視確認する。',
  modelTypeId: 'requirement',
  requirementsText:
    'LED 懐中電灯のレビュー用スペック。光を出す（機能要求）、周囲を明るくする（派生機能要求）、屋外使用（設計制約）の 3 項目から始めて、AI と対話しながら要求を整理する。',
  steps: [
    {
      userMessage:
        'LED 懐中電灯の要求仕様を CSV で整理してください。(scenario 08 step 1)',
      mockReplies: [
        {
          text:
            '初期の 3 要求です。\n\n' + wrapCsv(STEP1),
        },
      ],
      pauseMs: 2500,
      note: '初期生成: 3 要求、マーカーなし',
    },
    {
      userMessage:
        'R1 の記述を「周囲を明るくする光を出す」に書き換えてください。',
      mockReplies: [
        {
          text: 'R1 の記述を調整しました。\n\n' + wrapCsv(STEP2),
        },
      ],
      pauseMs: 2500,
      note: '書き換え: R1 のみオレンジ（changed）',
    },
    {
      userMessage:
        'バッテリ交換頻度に関する非機能要求を Q1 として追加してください。',
      mockReplies: [
        {
          text: 'Q1 を追加しました。\n\n' + wrapCsv(STEP3),
        },
      ],
      pauseMs: 2500,
      note: '追加: Q1 のみ緑（added）、他は変化なし',
    },
  ],
};

export default scenario;
