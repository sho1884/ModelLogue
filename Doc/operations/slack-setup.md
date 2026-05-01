# Slack 中継 セットアップ手順 / Slack Relay Setup Guide

**対象**: UR-017（複数人レビューチャット）の Slack 中継機能（SR-132〜135）を動かすための事前準備
**バージョン**: 1.0（v7.8 Phase A）
**作成日**: 2026-05-01
**関連**: [ADR-016](../adr/ADR-016-multi-participant-chat-via-slack-relay.yaml) / [ADR-017](../adr/ADR-017-slack-relay-via-polling.yaml)

---

## 0. このガイドが扱うこと

ModelLogue の Slack 中継機能を有効化するための **Slack 側設定** と **n8n 側 Credential 登録** までを扱います。n8n ワークフローの import や ModelLogue 側の動作確認は別途。

Phase A スコープ：

- Slack ワークスペース 1 つ × チャンネル 1 つに固定して中継
- Bot は手動でチャンネルに招待
- チャンネル ID は環境変数 `SLACK_RELAY_CHANNEL_ID` で n8n に渡す

Phase B（per-session 選択、Bot の on-demand join）は別 UR/SR で扱う。本ガイドの対象外。

## 1. 前提条件

| 項目 | 必要な権限 / 状態 |
|---|---|
| Slack ワークスペース | App をインストールできる権限（自分が管理者でない場合は管理者承認が必要） |
| n8n | Docker などで動作中、ブラウザ UI からアクセス可能 |
| 開発用チャンネル | あらかじめ Slack ワークスペース内に作成しておく（例：`#modellogue-dev`） |

## 2. Slack App を作成する

1. https://api.slack.com/apps を開く
2. **"Create New App"** → **"From scratch"** を選択
3. 入力：
   - **App Name**: `ModelLogue Relay`（任意）
   - **Pick a workspace**: 開発用ワークスペースを選択
4. **"Create App"** をクリック

## 3. Bot Token Scopes を設定する

左サイドメニュー **"OAuth & Permissions"** を開き、**"Scopes"** → **"Bot Token Scopes"** に以下を追加：

| Scope | 用途 |
|---|---|
| `channels:history` | チャンネルメッセージ読み取り（読み方向：Slack → ModelLogue） |
| `chat:write` | メッセージ投稿（書き方向：ModelLogue → Slack） |
| `users:read` | 発言者の username 解決（"Slack · alice" のような表示） |
| `channels:read` | チャンネル一覧（Phase B で使うが、先回りで入れておく） |

> **注**: `channels:join`（Bot が自動でチャンネル参加）は Phase A では不要（手動招待）。Phase B で必要になります。

## 4. App をワークスペースにインストールする

1. **"OAuth & Permissions"** ページ上部の **"Install to Workspace"** をクリック
2. 権限確認画面で **"Allow"**
3. インストール後、ページ上部に **"Bot User OAuth Token"** が表示される（`xoxb-` で始まる文字列）
4. **このトークンを手順 7 で n8n に登録します**。安全な場所に控えておく

## 5. Bot を開発用チャンネルに招待する

Slack 上で：

1. 開発用チャンネル（例：`#modellogue-dev`）を開く
2. 入力欄に：
   ```
   /invite @ModelLogue Relay
   ```
3. または、チャンネル名クリック → "Integrations" タブ → "Add apps" → ModelLogue Relay を選択

Bot がチャンネルに加わったメッセージが流れれば OK。

## 6. チャンネル ID を控える

1. Slack 上で開発用チャンネルの名前をクリック（チャンネル詳細を開く）
2. 一番下の **"Channel ID"** 欄に `CXXXXXXXX` 形式の ID が表示される
3. コピーして控える（手順 8 で `SLACK_RELAY_CHANNEL_ID` に設定）

## 7. n8n に Slack Credential を登録する

1. n8n の UI を開く
2. 左メニュー **"Credentials"** → **"Add Credential"**
3. 検索ボックスに `Slack API` と入力 → 選択
4. **Credential Name**: `ModelLogue Slack Relay`（任意）
5. **Authentication**: `Access Token`
6. **Access Token**: 手順 4 で控えた `xoxb-` トークンを貼り付け
7. **"Save"**

接続テストが通ることを確認します。

## 8. n8n 側に環境変数を設定する

n8n を起動している環境に応じて：

### docker-compose.yml の場合

`docker-compose.yml` の n8n サービスの `environment:` に追加：

```yaml
services:
  n8n:
    environment:
      - SLACK_RELAY_CHANNEL_ID=CXXXXXXXX  # 手順 6 で控えた ID
```

設定後：

```bash
docker compose up -d n8n
```

### 直接起動している場合

```bash
export SLACK_RELAY_CHANNEL_ID=CXXXXXXXX
n8n start
```

### ModelLogue 側 (.env)

ModelLogue（Vite）にも n8n の base URL を渡します。`.env` に追加：

```
VITE_SLACK_RELAY_BASE_URL=http://localhost:5678
```

設定すると ModelLogue が REVIEW phase 中に polling を開始します。
**未設定（または空）なら中継は無効化** され、ChatPanel は facilitator
+ AI のみで通常動作します（SR-135 の AC）。

> **無効化の双方向**: n8n 側 `SLACK_RELAY_CHANNEL_ID` と ModelLogue 側
> `VITE_SLACK_RELAY_BASE_URL` のどちらか一方が未設定なら中継は走り
> ません。`SLACK_RELAY_CHANNEL_ID` を消せば n8n の Slack Trigger が
> 発火しないので、ModelLogue 側がpolling しても空配列のみが返ります。

## 9. Slack Event Subscription を設定する（Slack Trigger 用）

n8n の Slack Trigger ノードがメッセージを受信できるよう、Slack App 側に Event Subscription を登録します。

> **先に n8n のワークフローを import しておく必要があります**。ModelLogue リポジトリの `n8n/workflows/modellogue-slack-relay.json`（SR-132 実装で追加予定）を import し、Slack Trigger ノードの **Webhook URL** をコピーしておいてください。

1. Slack App ページの左メニュー **"Event Subscriptions"** を開く
2. **"Enable Events"** を On に切り替え
3. **"Request URL"** に n8n の Slack Trigger Webhook URL を貼り付け
   - n8n が外部から到達可能である必要があります（ngrok / Cloudflare Tunnel / セルフホスト URL）
   - Slack 側で URL の検証 challenge が走るので、n8n ワークフローが Active になっている状態で行う
4. 検証成功（Verified ✓）を確認
5. **"Subscribe to bot events"** に以下を追加：
   - `message.channels` — 公開チャンネルのメッセージを受信
6. **"Save Changes"**
7. 画面上部のバナーに **"You've changed your bot scopes... reinstall your app"** と出たら、Reinstall to Workspace

## 10. 動作確認

### 10.1 読み方向（Slack → ModelLogue）

1. n8n の slack-relay ワークフローを Active 状態にする
2. Slack の開発チャンネルに何か発言を投稿
3. n8n の Executions タブに該当 workflow の実行ログが流れることを確認
4. （SR-132 実装後）ModelLogue を REVIEW phase で開き、ChatPanel に Slack 発言が `Slack · <username>` として 4 秒以内に流れることを確認

### 10.2 書き方向（ModelLogue → Slack）

1. （SR-132 実装後）ModelLogue で進行役として発言
2. Slack の開発チャンネルに `[facilitator] ...` が 2 秒以内に投稿されることを確認
3. AI 応答も `[AI] ...` として投稿されることを確認

## トラブルシューティング

| 症状 | 確認ポイント |
|---|---|
| Slack Trigger が発火しない | Bot がチャンネルに参加しているか（手順 5）。Event Subscription の Request URL が Verified か（手順 9） |
| 401 Unauthorized | n8n の Slack Credential に正しい xoxb トークンが入っているか（手順 7） |
| 403 Forbidden | Bot Token Scope が不足していないか（手順 3） |
| ChatPanel に Slack 発言が流れない | `SLACK_RELAY_CHANNEL_ID` が n8n に渡っているか（手順 8）。ModelLogue が REVIEW phase に入っているか |
| Slack 投稿が `[facilitator]` prefix なしで届く | n8n ワークフロー側の prefix 整形ロジックを確認（SR-132 実装側） |

## 関連ドキュメント

- [UR-017 / SR-132〜135](../requirements/Requirements_Specification.md#317-multi-participant-review-chat--複数人レビューチャット-ur-017-v78-planned)
- [NFR-080 / NFR-081](../requirements/nonfunctional_requirements.yaml)
- [ADR-016 Slack 中継方式採用](../adr/ADR-016-multi-participant-chat-via-slack-relay.yaml)
- [ADR-017 polling 方式採用](../adr/ADR-017-slack-relay-via-polling.yaml)
