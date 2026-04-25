# n8n Workflow — model-type-aware prompt branching

| 項目 | 内容 |
|---|---|
| Version | 2.0 |
| Created | 2026-04-23 |
| Updated | 2026-04-25 (v7.6: added process type) |
| Status | current |

## Purpose / 目的

ModelLogue は複数のモデル型をサポートしており、n8n の AI Agent は
`modelTypeId` を見てシステムメッセージと user text を出し分ける。旧ファイル名
`n8n_requirement_prompt.md` から改名済み（v7.6 で第 3 型を追加したため）。

| Session type | AI への入力 | AI の応答形式 |
|---|---|---|
| `state-machine` | `currentSource` (PlantUML) + `markerContext` + `stateDiagram.ebnf` | ` ```plantuml ` ブロック |
| `requirement` | `requirementsCsv` (SR-113 CSV) + review rules | ` ```csv ` ブロック |
| `process` (v7.6) | `currentSource` (PlantUML activity) + `markerContext` + `processDiagram.ebnf` | ` ```plantuml ` ブロック |

SPA 側は `ChatRequest.modelTypeId` と、型ごとに適した補助データ（`requirementsCsv` / `grammarSpec`）を
`callChat` に渡す。n8n のワークフローはその `modelTypeId` で両テンプレートを分岐する。

## Payload / 送信される JSON

```jsonc
{
  "modelTypeId": "state-machine" | "requirement" | "process",
  "currentSource": "<PlantUML: state-machine / process sessions>",
  "requirementsCsv": "<SR-113 CSV: requirement sessions only>",
  "history": [...],
  "userMessage": "...",
  "markerContext": "<state-machine only; requirement/process pass empty>",
  "grammarSpec": "<EBNF: state-machine → stateDiagram.ebnf; process → processDiagram.ebnf; requirement → empty>",
  "requirementsText": "<requirements tab body, optional>",
  "responseLanguage": "ja" | "en"
}
```

## 適用手順 / How to apply

`n8n/workflows/modellogue-chat.json` は **リポジトリに置いてあるマスター**。ローカル n8n UI に反映：

1. n8n UI（`http://localhost:5678`）で既存の `modellogue-chat` ワークフローを開く。
2. メニュー **⋮ → Import from File…** で `n8n/workflows/modellogue-chat.json` を選択 → 既存を上書き。
3. ノード配線（Webhook → AI Agent → Respond to Webhook、AI Agent ← Google Gemini Chat Model）を確認。
4. Gemini Credential（`Google Gemini(PaLM) Api account`）がアタッチされたままか確認、切れていたら再アタッチ。
5. 右上の **Publish** ボタンでアクティブ化。
6. ブラウザ側：
   - `.env.local` の `VITE_USE_MOCK_AI` を外す（or false にする）→ dev サーバー再起動。
   - 各モデル型でセッションを作って Generate model / チャットを試す：
     - state-machine: 従来通り
     - requirement: Requirements タブに仕様を書く → Generate model → CSV 応答、自動 apply で class 図
     - process: Requirements タブに業務フローを自然言語で書く → Generate model → PlantUML activity 応答、自動 apply で activity 図 + Scenarios タブ populate

## Prompt design / プロンプト設計

**systemMessage は静的な 1 本の文字列**。3 つのモデル型ルールを全部書き並べ、AI が user text 先頭の
`Session type:` 行を見てどれに従うかを判断する構造にした。n8n の式エンジン（tmpl）は backtick
テンプレートリテラル + `${...}` の組み合わせを時々うまく展開できず `NodeOperationError: invalid syntax` を
吐くことがあったので、text 式は **`+` による文字列連結と三項のみ**に留めている（v7.5 で学んだ教訓）。

**text は式**。3-way ternary で `Session type: STATE-MACHINE DIAGRAM` / `REQUIREMENT DIAGRAM` /
`PROCESS DIAGRAM` のヘッダ行を生成、`responseLanguage:` 行、`userMessage`、型別本体（requirement なら
`requirementsCsv`、それ以外は `currentSource + markerContext + grammarSpec`）、`requirementsText` 任意末尾
の順で組み立てる。

## Prompt Rules / プロンプトの要点

**共通**: 応答言語は user text 先頭の `responseLanguage:` に従う（単一言語、混在禁止）。

**state-machine のとき**: ADR-009 の状態遷移図サブセット、` ```plantuml ` ブロックで完全なソースを返す。

**requirement のとき**:
- CSV ヘッダは `id,statement,type,text,contained_in,derives_from,hidden,deleted,note` 固定。
- **ADR-014 の soft-delete ルール**: 統合・除外時は行を消さず `deleted=Y` + 理由 (note)。証跡を消さない。
- 一時的に関心外は `hidden=Y`（理由不要）。
- ` ```csv ` ブロックひとつ、全要求入り。PlantUML は返さない。

**process のとき**（v7.6 追加）:
- PlantUML activity サブセット（EBNF が user message 末尾に付く）。
- `start` 1 回、`stop` / `end` 1 回以上。
- `:task;<<timer>>` / `<<message>>` / `<<error>>` がイベント表現。
- `if (cond) then (yes) ... else (no) ... endif` — 両ラベル必須。
- `fork` は入れ子禁止。`partition` は 1 階層のみ。`|Actor|` スイムレーンは人・組織のみ。
- **外部 IT システム / リポジトリ は `note right\n**外部:** 名前\nend note` で表現**（§3.15.3 規約）。
  レーンや task として混ぜない。順序関係を持たないため note 構文が意味論的に正しい。
- 禁止: `while` / `repeat` / `elseif` / `detach` / `kill` / `(*) -->` 旧構文。
- ` ```plantuml ` ブロックひとつ、全ソース入り。CSV は返さない。

詳細は `n8n/workflows/modellogue-chat.json` 内の `options.systemMessage` を参照。

## トラブルシュート / Troubleshooting

- **`NodeOperationError: invalid syntax`**: 式がパースできていない。`text` 欄は `+` 連結 + ternary のみで書く（backtick テンプレートリテラルや `${...}` を避ける）。
- **AI が違うブロック形式を返す**: user text の 1 行目に正しい `Session type:` が出ているか確認（ネットワークペインで POST ボディを見ると早い）。`$json.body.modelTypeId` が届いていないと text 式が想定外の分岐に落ちる。
- **PlantUML がパースできない → 自動 re-ask**: `chatStore.sendAndAutoReask` が型別に ` ```plantuml ` / ` ```csv ` を要求し直す。2 回で回復しない場合は systemMessage の subset 説明と parser (src/modelTypes/<type>/parser.ts) が合っていない可能性。両者を突き合わせ。
- **`requirementsCsv` が空**: 要求図の初回生成時、text 式で `(empty - no requirements yet, this is the initial generation)` にフォールバックする仕組みあり。
- **process の 2 回目以降で Scenarios タブが空**: parser が EBNF 違反（`elseif`, `while` など）を検出して model=null を返している可能性。ParseErrors が修正されるまで markers / Scenarios は前回状態から更新されない。
