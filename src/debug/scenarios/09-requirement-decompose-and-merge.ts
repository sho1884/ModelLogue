import type { Scenario } from './types';

// Exercises the structural-change side of requirement apply:
//  - Step 1: start with a single coarse functional requirement "雨天でも使える".
//  - Step 2: DECOMPOSE into three waterproofing sub-requirements, all
//    contained in the original — the 3 new sub-reqs get green markers,
//    the parent (relations added) gets an orange marker.
//  - Step 3: MERGE two of the sub-requirements back into one — the
//    merged survivor gets an orange marker (statement + relations
//    changed), the removed sibling gets NO marker (per user direction:
//    deletion is confirmed in the Requirement list tab, not on the
//    diagram).

function wrapCsv(csv: string): string {
  return '```csv\n' + csv + '\n```';
}

const HEADER = 'id,statement,type,text,contained_in,derives_from,hidden,deleted,note';

const STEP1 = [
  HEADER,
  'R1,雨天でも使える,functional,,,,,,',
].join('\n');

const STEP2 = [
  HEADER,
  'R1,雨天でも使える,functional,,,,,,',
  // 3 new children, contained in R1.
  'R11,ケースの水密性,functional,,R1,,,,',
  'R12,スイッチの防滴,functional,,R1,,,,',
  'R13,電池室の密閉,functional,,R1,,,,',
].join('\n');

const STEP3 = [
  HEADER,
  'R1,雨天でも使える,functional,,,,,,',
  // R11 is merged into a more general requirement, absorbing R12.
  'R11,本体全体の水密性,functional,,R1,,,,',
  // R12 removed (deleted=Y would keep it as evidence — here we drop it
  // entirely to test the "removed → no marker" path).
  'R13,電池室の密閉,functional,,R1,,,,',
].join('\n');

const scenario: Scenario = {
  id: '09-requirement-decompose-and-merge',
  label: 'Requirement: 分解 → 統合',
  description:
    '「雨天でも使える」1 要求からスタートし、3 つの子要求に分解 → 2 つを 1 つに統合、という構造変更を連続 apply する。分解ステップでは追加された子 3 件が緑・親 R1 が関係追加でオレンジ、統合ステップでは R11 がオレンジ・R12 は図からは消えてマーカー無し（表で確認）。',
  modelTypeId: 'requirement',
  requirementsText:
    'LED 懐中電灯の防水要求。最初は粗い 1 要求だが、レビュー中に水密の観点で分解し、その後 2 つをまとめる想定。',
  steps: [
    {
      userMessage:
        '「雨天でも使える」を 1 要求として登録してください。(scenario 09 step 1)',
      mockReplies: [
        {
          text: '初期要求です。\n\n' + wrapCsv(STEP1),
        },
      ],
      pauseMs: 2500,
      note: '初期生成: 1 要求、マーカーなし',
    },
    {
      userMessage:
        'R1 を水密性観点で 3 つのサブ要求に分解してください。',
      mockReplies: [
        {
          text: 'R11/R12/R13 に分解しました。\n\n' + wrapCsv(STEP2),
        },
      ],
      pauseMs: 2500,
      note: '分解: R11/R12/R13 緑、R1 オレンジ（関係追加）',
    },
    {
      userMessage:
        'R11 と R12 は共通化できるので、R11 に統合してください。',
      mockReplies: [
        {
          text: 'R11 に統合しました。\n\n' + wrapCsv(STEP3),
        },
      ],
      pauseMs: 2500,
      note: '統合: R11 オレンジ（記述変更）、R12 は図から消え、R13 は据え置き',
    },
  ],
};

export default scenario;
