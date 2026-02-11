# ModelLogue 環境構築ガイド

**バージョン**: 1.0
**作成日**: 2026-02-11

---

## 前提条件

以下がインストール済みであること:

| ツール | 確認コマンド | 備考 |
|-------|------------|------|
| Docker Desktop | `docker --version` | Docker Engine 20+ |
| Docker Compose | `docker compose version` | V2（Docker Desktop同梱） |
| Node.js | `node --version` | v20+ |
| npm | `npm --version` | Node.js同梱 |
| Git | `git --version` | |

## Step 1: リポジトリクローン

```bash
git clone https://github.com/sho1884/ModelLogue.git
cd ModelLogue
```

## Step 2: Docker コンテナ起動

> **あなたの作業**: Docker Desktopが起動していることを確認してから実行してください。
> 初回はイメージのダウンロードに数分かかります。

```bash
docker compose up -d
```

起動確認:

```bash
# PlantUML Server の確認
curl -s http://localhost:8080/png/SoWkIImgAStDuNBAJrBGjLDmpCbCJbMmKiX8pSd9vt98pKi1IW80

# → PNG画像のバイナリが返ればOK

# n8n の確認
curl -s http://localhost:5678/healthz

# → {"status":"ok"} が返ればOK
```

コンテナの状態確認:

```bash
docker compose ps
```

両方の Status が `running` であることを確認。

## Step 3: n8n 初期設定

> **あなたの作業**: ブラウザで操作する必要があります。

### 3.1 n8n UI にアクセス

ブラウザで http://localhost:5678 を開く。

初回アクセス時にオーナーアカウントの作成を求められる。
ローカル開発用なので任意のメール・パスワードでOK。

### 3.2 Gemini API クレデンシャル設定

> **あなたの作業**: Gemini API キーが必要です。

1. n8n UI 左メニュー → **Credentials**
2. **Add Credential** → 「Google Gemini」で検索
3. API Key を入力して保存

### 3.3 チャット中継ワークフロー構築

> **あなたの作業**: n8n UI でワークフローを構築します。

**方法A: テンプレートJSONインポート**（推奨）

1. n8n UI → **Workflows** → **Add Workflow**
2. 右上メニュー（...）→ **Import from file**
3. `n8n/workflows/chat-relay.json` を選択
4. Gemini ノードのクレデンシャルを Step 3.2 で作成したものに設定
5. **Save** → **Activate** (トグルをON)

**方法B: 手動構築**

以下のノードを接続:

```
[Chat Trigger] → [Google Gemini Chat Model] → [AI Agent]
```

1. **Chat Trigger** ノード: デフォルト設定でOK（Webhookが自動生成される）
2. **AI Agent** ノード:
   - System Prompt: 「You are an AI assistant for software design reviews. When suggesting changes, provide complete PlantUML source in a ```plantuml code block.」
3. **Google Gemini Chat Model** ノード: Step 3.2 のクレデンシャルを選択、モデル `gemini-2.5-flash`
4. **Save** → **Activate**

### 3.4 チャット動作確認

1. ワークフローが **Active** になっていることを確認
2. Chat Trigger ノードをクリック → **Chat** ボタン → テストチャットが開く
3. 「Hello」と送信 → AIが応答すれば成功

## Step 4: プロトタイプ確認

> **あなたの作業**: ブラウザで確認します。

```bash
# 簡易HTTPサーバでプロトタイプを配信
npx serve Prototype/
```

ブラウザで http://localhost:3000 を開く（ポートは `serve` の出力で確認）。

確認項目:

- [ ] PlantUML の SVG 図が表示されている
- [ ] ダミーの状態遷移表が表示されている
- [ ] n8n チャットウィジェットが表示され、AIと会話できる

## トラブルシューティング

### Docker コンテナが起動しない

```bash
# ログを確認
docker compose logs plantuml
docker compose logs n8n
```

### PlantUML Server に接続できない

- `http://localhost:8080` にブラウザでアクセスできるか確認
- Docker Desktop が起動しているか確認

### n8n に接続できない

- `http://localhost:5678` にブラウザでアクセスできるか確認
- ポート 5678 が他のプロセスで使われていないか確認: `lsof -i :5678`

### n8n チャットが応答しない

- ワークフローが **Active** になっているか確認
- Gemini クレデンシャルが正しく設定されているか確認
- n8n ログを確認: `docker compose logs n8n`

## コンテナの停止・削除

```bash
# 停止（データは保持）
docker compose stop

# 停止＋削除（n8nデータはボリュームに保持される）
docker compose down

# 完全削除（n8nデータも削除）
docker compose down -v
```
