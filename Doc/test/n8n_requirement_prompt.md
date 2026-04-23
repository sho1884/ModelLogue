# n8n Workflow Update / 要求図対応プロンプトへの更新

| 項目 | 内容 |
|---|---|
| Version | 1.0 |
| Created | 2026-04-23 |
| Status | v7.5 Step 9 |

## Purpose / 目的

v7.5 で要求図セッションに対応したことに伴い、n8n の AI Agent 側も **モデル型で応答形式を切り替える** 必要がある。

| Session type | AI への入力 | AI の応答形式 |
|---|---|---|
| state-machine | `currentSource` (PlantUML) + EBNF | ` ```plantuml ` ブロック |
| requirement | `requirementsCsv` (SR-113 CSV) + レビュー仕様 | ` ```csv ` ブロック |

対応後、SPA 側は `modelTypeId` と `requirementsCsv` を `ChatRequest` に含めて送る。n8n のワークフローはその `modelTypeId` で system message と user text をテンプレート分岐する。

## Payload / 送信される JSON（v7.5）

```jsonc
{
  "modelTypeId": "state-machine" | "requirement",
  "currentSource": "<PlantUML>",
  "requirementsCsv": "<SR-113 CSV, requirement sessions only>",
  "history": [...],
  "userMessage": "...",
  "markerContext": "...",
  "grammarSpec": "<EBNF>",
  "requirementsText": "...",
  "responseLanguage": "ja" | "en"
}
```

## 適用手順 / How to apply

`n8n/workflows/modellogue-chat.json` は **リポジトリに置いてあるマスター**。ローカルの n8n UI に反映するには：

1. n8n UI（`http://localhost:5678`）で既存の `modellogue-chat` ワークフローを開く。
2. メニュー **⋮ → Import from File…** で `n8n/workflows/modellogue-chat.json` を選択 → 既存を上書きする形でインポート。
3. ノード配線（Webhook → AI Agent → Respond to Webhook、AI Agent ← Google Gemini Chat Model）が維持されていることを確認。
4. Gemini の Credential（`Google Gemini(PaLM) Api account`）がアタッチされたままか確認。インポートでクレデンシャル参照が切れていたら、AI Agent ノードの **Google Gemini Chat Model** で再アタッチ。
5. 右上の **Publish** ボタンを押してワークフローをアクティブ化。
6. ブラウザ側：
   - `.env.local` の `VITE_USE_MOCK_AI=true` を一旦外して実 AI 経路に戻す。
   - 要求図セッションを新規作成 → Requirements タブに仕様を書き込む → Generate model。
   - AI の応答が ` ```csv ` ブロック付きで返り、自動 apply で class 図が描かれることを確認。

## Prompt Rules（system message に埋め込まれている要点）

**共通**: 応答言語は `responseLanguage` に従う（単一言語、混在禁止）。

**state-machine のとき**: これまで通り（ADR-009 のサブセット説明、` ```plantuml ` ブロックで完全なソースを返す）。

**requirement のとき**:

- CSV ヘッダは **`id,statement,type,text,contained_in,derives_from,hidden,deleted,note`** 固定。
- `type` は `functional` / `nonfunctional` / `constraint` / `requirement` のいずれか。
- **ADR-014 の soft-delete ルール**: 要求を統合・除外・破棄するときは行を消さず `deleted=Y` + 理由 (note) を必ず付ける。行を落とすとレビューの証跡が消える。
- 一時的に関心外にするだけなら `hidden=Y`（理由不要）を使う。
- 返すのは ` ```csv ` コードブロックひとつだけ。PlantUML は返さない（ツールが自動生成する）。**部分 CSV でなく、現時点の全要求を含めた完全な CSV** を返す。

詳細は `n8n/workflows/modellogue-chat.json` 内の `systemMessage` を参照。

## トラブルシュート / Troubleshooting

- **AI が ` ```plantuml ` を返してくる**: system message の `modelTypeId === 'requirement'` 分岐が効いていない。n8n の AI Agent ノードで **System Message** 欄に式 (`={{ ... }}`) が正しく入っているか確認。
- **CSV がパースできない → 自動 re-ask が走る**: SPA 側 (`chatStore.sendAndAutoReask`) が type 別に ` ```csv ` / ` ```plantuml ` をリクエストし直す。2 回で回復しない場合はヘッダ/列順のずれが多い。`system prompt` のヘッダ列と CSV parser (`src/modelTypes/requirement/csvParser.ts`) のヘッダ列を照合。
- **`requirementsCsv` が空**: 初回生成。system prompt 内のテンプレートで空の場合は `(empty — no requirements yet, this is the initial generation)` に置き換わっているはず。
