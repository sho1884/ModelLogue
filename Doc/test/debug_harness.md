# Debug Harness / デバッグ用モック AI & シナリオランナー

| 項目 | 内容 |
|---|---|
| Version | 1.1 |
| Created | 2026-04-16 |
| Updated | 2026-04-22 |
| Status | implemented (v7.4 で nswitch 系シナリオ 4 本を追加) |

## 1. Purpose / 目的

視覚的な不具合（座標ズレ、スケール、差分オーバーレイ、auto-fit、Apply フロー、auto-reask 等）を AI API を浪費せずに繰り返し検証するための仕組み。

スモークテストのたびに私（Claude）から「こう入力してください」とお願いし、ユーザーが手入力するのは非効率で再現性も低い。**固定シナリオを流すランナー**を入れて、同じ操作列を何度でも走らせる。

副次効果として、将来の Slack/Teams 連携（外部から chat を駆動する）の**雛形**になる。`sendMessage` を外部イベントで駆動できる形に揃えておけば、Slack bot から呼ぶのも scenario runner から呼ぶのも同じ経路で済む。

## 2. Activation / 有効化

環境変数 `VITE_USE_MOCK_AI=true` を立てると:

- `n8nService.chat()` が n8n webhook ではなく `mockAi.mockChat()` を呼ぶ
- 画面右下にシナリオランナーパネルが現れる

プロダクションビルドや通常の `npm run dev` ではフラグ未設定なので影響なし。

`.env.local`:
```
VITE_USE_MOCK_AI=true
```

## 3. Architecture / 構成

```
┌─────────────────────────┐    enqueue
│  ScenarioRunner (UI)    ├──────────────┐
│  - scenario 選択         │              │
│  - ▶ Play / ⏸ Pause    │              ▼
│  - step カウンタ         │       ┌───────────────┐
└───────────┬─────────────┘       │  mockAi.ts    │
            │ sendMessage         │  queue: [...] │
            ▼                     └──────┬────────┘
┌─────────────────────────┐              │ shift
│  useChatStore           │              │
│  .sendMessage(prompt)   ├─── callChat ─┤
└─────────────────────────┘              │
            │                            │
            └──── (flag ON) ─ mockChat ──┘
                  (flag OFF) ─ n8n fetch
```

### 3.1 mockAi.ts

FIFO キューに `ChatResponse` を積んでおき、`mockChat()` は 1 件ずつ shift して返す。
- `enqueueMockResponses(reps: ChatResponse[])`
- `clearMockQueue()`
- `async mockChat(req: ChatRequest): Promise<ChatResponse>` — 200-400ms の人工遅延を入れて loading UI が一瞬出るようにする

auto-reask のような「1 回のユーザーアクションで複数の `callChat` が起きる」ケースは、キューに応答を複数積んでおけば自然にカバーできる。

### 3.2 n8nService.ts の分岐

```ts
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  if (import.meta.env.VITE_USE_MOCK_AI === 'true') {
    return mockChat(req);
  }
  // ... 既存の n8n fetch
}
```

mockChat / 実 chat とも同じ `ChatResponse` を返すので、下流（normalizeResponse 等）はそのまま使える。

### 3.3 scenarios/*.ts

**1 シナリオ = 1 ファイル**。`src/debug/scenarios/NN-name.ts` に独立して置く。

各ファイルは `Scenario` 型を default export:
```ts
export interface ScenarioStep {
  userMessage: string;        // チャットログに残る user 発言
  mockReplies: ChatResponse[]; // 複数なら auto-reask 分を含む
  pauseMs?: number;            // ステップ後の待ち (既定 1500)
  note?: string;               // UI に小さく出す解説
}

export interface Scenario {
  id: string;                  // URL-safe, ファイル名と一致
  label: string;               // ランナーの pulldown に出す日本語名
  description: string;         // 何を検証するか
  requirementsText?: string;   // Requirements タブに流し込む
  steps: ScenarioStep[];
}
```

シナリオを追加するときは **このファイルだけ書き足せば** 自動的にランナーで選べるようにする (`scenarios/index.ts` で `import.meta.glob` 等で集約)。

### 3.4 ScenarioRunner.tsx

画面右下にフローティングパネル。`VITE_USE_MOCK_AI==='true'` の時だけ `MainLayout` から描画される。

操作:
- シナリオ pulldown
- ▶ Play: シナリオを実行
- ⏸ Pause / ▶ Resume
- ⏹ Stop: キューと途中状態をクリア
- ステップ進捗表示 (例: `2 / 5`)

実行ロジック:
```ts
async function run(scenario) {
  useChatStore.getState().clear();
  useRequirementsStore.setState({ requirementsText: scenario.requirementsText ?? '' });

  for (const step of scenario.steps) {
    enqueueMockResponses(step.mockReplies);
    await useChatStore.getState().sendMessage(step.userMessage);
    await sleep(step.pauseMs ?? DEFAULT_PAUSE);
  }
}
```

## 4. シナリオ一覧 (v1.1)

初版（v1.0）は 01〜03 の UX 検証用シナリオのみ。v1.1 で Test cases タブ（SR-102 / SR-103）の動作確認用に 04〜07 を追加。nswitch の各挙動を手動操作なしで再現できるようにして、人間が目視で確かめたり、結果をスクリーンショット／Copy で持ち出しやすくするのが狙い。

### 4.1 UX 検証 (v1.0)

| id | label | 検証するもの |
|---|---|---|
| `01-size-aspect` | サイズ・縦横比の変化 | auto-fit、ペーンの枠サイズ追従、スケール一致 |
| `02-add-remove-change` | ノードの追加・削除・変更 | 差分オーバーレイ (緑/赤/橙) が期待位置に乗るか、件数一致 |
| `03-composite-and-reask` | 階層追加 + auto-reask | 複合状態の描画、EBNF 違反 → 自動再要求フロー |

### 4.2 Test cases タブ検証 (v1.1)

| id | label | 検証するもの |
|---|---|---|
| `04-nswitch-levels` | N-switch レベル切替（0/1/2） | N セレクタで required chains 件数が増えていく、View: Tests / Coverage トグル、Copy / Save で §6.1/§6.2 の CSV が出る |
| `05-unreachable-within-cap` | Unreachable — 到達不能状態の検出 | disconnected component を含むモデルで `uncovered` バナーが出る／Coverage ビューで amber 行（status=unreachable-within-cap）が並ぶ |
| `06-composite-layers` | 複合状態のレイヤ分解 | nswitch の §7.1 レイヤ分解で `top-NNN` と `Operating-NNN` の 2 系統が出る。Coverage ビュー列ヘッダも両レイヤの test_id を持つ |
| `07-mainloop-cycle-closure` | Mainloop（終了なし）— サイクルクロージャ | `[*]_final` なしの mainloop。§7.4 の cycle closure fallback により、テストの `end` 列が通常状態になる |

それぞれの詳細は `src/debug/scenarios/NN-*.ts` を参照。`04`〜`07` は 1 ステップ（モデル 1 枚を load して Apply）で完結する — Apply 後の Test cases タブを人間が自由に触って確かめる設計。

## 5. Non-goals / 範囲外

- **自動アサーション**: 現状は「目で見て確認」のための再現性ツール。将来 Playwright 等で screenshot assertions を入れる余地はあるが、本ドキュメントのスコープ外。
- **プロダクション環境での有効化**: `.env.production` には入れない。フラグは dev/ローカルのみ。
- **AI 応答品質のテスト**: 本当の AI 応答品質は実 API でしか検証できない。本ハーネスは UI/フロー側の検証に限定。

## 6. 将来拡張 (planned next)

- **Slack 連携の雛形**: ScenarioRunner と同じ「外部から sendMessage を駆動する」インターフェースを n8n webhook inbound として受けるエンドポイント (`/slack-review-input`) を追加し、chat driver を抽象化する。
- **シナリオ録画**: ユーザーが手動で操作した内容を `ChatMessage[]` として一旦記録 → Scenario 形式に出力するツール。実ユースケースから再現テストを作れる。
- **アサーション追加**: 各 step の後に「currentSource に State X が含まれる」「markers の数が N」等の expect を書けるようにする。

## 7. 関連ドキュメント

- [SR-030](../requirements/system_requirements.yaml) — チャット経路（mockChat もここの契約を満たす）
- [SR-033](../requirements/system_requirements.yaml) — 提案ビュー（シナリオが検証対象）
- [architecture.md §6.6](../architecture.md) — n8n Service インターフェース
