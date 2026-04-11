# n8n ワークフロー

ModelLogueのAIチャット連携で使うn8nワークフローの定義と、セットアップ手順。

## ファイル

- `workflows/modellogue-chat.json` — チャット中継ワークフロー（Webhook → AI Agent → Respond to Webhook）

## 初回セットアップ手順

### 前提

- n8nが起動している（`http://localhost:5678`）
- Google Gemini APIキーを取得済み

### 1. Gemini API Credentialを登録

1. n8nの画面左下の「User settings」→「Credentials」を開く
2. 「Add credential」をクリック
3. 検索ボックスに「Google Gemini」と入力し、「Google Gemini(PaLM) API」を選択
4. 「API Key」欄にあなたのGemini APIキーを貼り付け
5. 「Save」をクリック
6. 登録したCredentialの名前をメモしておく（デフォルトは「Google Gemini account」）

### 2. ワークフローをインポート

1. n8n画面左上の「Workflows」を開く
2. 右上の「Add workflow」の横の「⋮」→「Import from File」をクリック
3. `n8n/workflows/modellogue-chat.json` を選択してインポート
4. ワークフローが画面に表示される

### 3. Gemini Credentialをワークフローに紐づける

1. インポートされたワークフロー内の「Google Gemini Chat Model」ノードをクリック
2. 「Credential to connect with」のドロップダウンで、手順1で登録したCredentialを選択
3. ノードを閉じる

### 4. ワークフローをActivate（Publish）

1. 画面右上の「Inactive」トグルをクリックして「Active」にする
2. 「Activate」を確認するダイアログが出たら「Yes, activate and save」をクリック
3. Production Checklistが出たら「Ignore for all workflows」で閉じる

### 5. 動作確認

ブラウザのDevToolsやcurlで、以下のPOSTリクエストを送って応答を確認：

```bash
curl -X POST http://localhost:5678/webhook/modellogue-chat \
  -H "Content-Type: application/json" \
  -d '{
    "currentSource": "@startuml\n[*] --> Idle\nIdle --> Active : start\n@enduml",
    "history": [],
    "userMessage": "この図の問題点を教えて"
  }'
```

Gemini からの応答が返ってくれば成功。

`{ "text": "..." }` という形式で返ってきます。

## ワークフローの構造

```
Webhook (POST /webhook/modellogue-chat)
  ↓ body: { currentSource, history, userMessage }
  ↓
AI Agent
  ↑ Google Gemini Chat Model (Credential経由)
  ↓
Respond to Webhook
  ↓ { text: <AI response> }
```

### システムプロンプト

AI Agentノードのシステムプロンプトで、以下を指定している：
- ModelLogueのレビュー目的
- PlantUMLサブセットの範囲（複合状態は1階層、ヒストリや直交領域は非サポートなど）
- 修正提案時は ` ```plantuml ` コードブロックを必ず含める

### 入力フォーマット

Webhookが受け取るJSONは以下の構造：

```typescript
{
  currentSource: string;   // 現在のPlantUMLソース
  history: Array<{         // これまでの対話（古い順）
    role: 'user' | 'assistant';
    content: string;
  }>;
  userMessage: string;     // 今回のユーザー発言
}
```

### 出力フォーマット（Phase 1）

```typescript
{
  text: string;  // AIの応答テキスト
}
```

Phase 2 以降で、AIレスポンスから ` ```plantuml ` コードブロックを抽出して
`suggestedSource` フィールドを加える予定（ADR-005）。

## トラブルシューティング

### CORS エラーがブラウザで出る

ワークフローの「Respond to Webhook」ノードに `Access-Control-Allow-Origin: *`
ヘッダーを含めているので、通常は発生しない。もし出る場合は、
そのヘッダーが正しく設定されているか確認する。

### 404 が返る

- ワークフローがActivate（Publish）されているか確認
- WebhookのパスがJSONの通り `modellogue-chat` になっているか確認

### Credential エラー

- 「Google Gemini Chat Model」ノードで正しいCredentialが選択されているか
- Credential の API キーが有効か（Gemini APIコンソールで確認）

### モデル名エラー

ノードのモデル名は `models/gemini-2.5-flash`。バージョンが変わったら更新する。
