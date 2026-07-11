# 限定公開ベータ デプロイ手順 / Limited Public Beta Deployment Guide

> **⚠ 最初に [deploy/ENVIRONMENT.md](../../deploy/ENVIRONMENT.md) を読んでください。**
> このガイドは「ゼロから立ち上げる手順」で、実際に動いている箱とは一部違います。
> 食い違ったら ENVIRONMENT.md が正。今の相違点：実サーバは **XServer VPS**（Hetzner ではない）、
> コード更新は **`./deploy/deploy.sh`**（`git pull` は効かない＝サーバは git チェックアウトではない）、
> AI は **OpenAI gpt-5.5**（Gemini ではない）、起動は compose ファイル **3 つ**・プロジェクト名 `modellogue`。

**対象**: ModelLogue を VPS ＋ Cloudflare で「限定公開ベータ」として立ち上げる管理者（＝operator）
**バージョン**: 1.0（v8.0 planned）
**関連**: UR-018 / SR-136〜139 / NFR-090・NFR-091、[Requirements_Specification.md §3.18](../requirements/Requirements_Specification.md)

---

## 0. このガイドが扱うこと

「未認証は AI 抜きのフル機能、認証した operator だけ AI」を、実際に公開して動かすまで。SR-136（フロントの保険）と SR-139（自己完結スタック）は**実装済み**なので、本ガイドは主に **SR-137/138＝認証ゲート（Cloudflare）とデプロイ作業**を扱う。

### 全体像

```
          ┌──────────────── Cloudflare ────────────────┐
 ブラウザ →│  TLS  +  Access(operator のみ AI 経路を保護) │→ Tunnel →┐
          └────────────────────────────────────────────┘          │ (origin は
                                                                    │  Tunnel 経由
   ┌──────────────── Hetzner VPS (docker compose) ──────────────┐  │  でしか到達不可)
   │  web(Caddy) ── SPA配信 + /plantuml /nswitch /n8n/webhook へ ←┘
   │      ├─ plantuml   (SVG生成・秘密なし)
   │      ├─ nswitch-api (テスト生成・秘密なし)
   │      └─ n8n        (Gemini キー保持・エディタは非公開)
   └────────────────────────────────────────────────────────────┘
```

- **安全（NFR-090）**: origin は Tunnel 経由でしか到達できず（inbound は SSH のみ開放）、AI 経路（`/n8n/webhook/*`）は Cloudflare Access が operator 以外を弾く。フロントの出し分け（SR-136）は保険にすぎない。
- **簡単・変えやすい（NFR-091）**: 認証は「作らない」マネージドゲート。将来は同じ継ぎ目（`/auth/whoami` の identity ヘッダ）で別プロバイダに差し替え可能。

---

## 1. 前提 / Prerequisites

- **Hetzner Cloud** の VPS 1 台（目安 CX22 相当：2 vCPU / 4GB。US ロケーションを選ぶと日本からの体感が良い）
- **ドメイン 1 つ**を **Cloudflare** に登録済み（例では `beta.example.com` を使う）
- **Cloudflare Zero Trust**（無料枠で可）
- **AI プロバイダの API キー**（実サーバは **OpenAI `gpt-5.5`**。後で n8n の Credential に入れる。**課金上限を先に設定**しておくこと）
- 手元に `git` / SSH クライアント

---

## 2. VPS を用意し Docker を入れる

```bash
ssh root@<vps-ip>
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
# リポジトリ取得
git clone https://github.com/sho1884/ModelLogue.git
cd ModelLogue
```

`.env` を作る（[.env.example](../../.env.example) を参照。VITE_* は未設定のままでよい＝同一オリジン相対パス）:

```bash
cat > .env <<'ENV'
TIMEZONE=Asia/Tokyo
PUBLIC_BASE_URL=https://beta.example.com
# WEB_PORT は既定 8088。Tunnel からのみ叩くので公開はしない。
ENV
```

---

## 3. スタックを起動する

```bash
docker compose -p modellogue-prod -f docker-compose.prod.yml up -d --build
```

`web` だけがポート（`8088`）を持つ。**このポートはファイアウォールで外部公開しない**（次の Tunnel 経由でのみ使う）。inbound は SSH(22) のみ許可：

```bash
ufw allow 22/tcp && ufw --force enable
```

セルフチェック（VPS 内から）:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8088/                 # 200 text/html
curl -s http://localhost:8088/n8n/healthz                                                        # {"status":"ok"}
curl -s http://localhost:8088/auth/whoami                                                         # 401 {"authenticated":false}（ゲート未通過＝匿名）
```

---

## 4. Cloudflare Tunnel（origin を晒さない）

Cloudflare の Zero Trust ダッシュボード → **Networks → Tunnels → Create tunnel**（`cloudflared`）。トークンを VPS に置いて起動（compose に足すのが楽）:

```yaml
# docker-compose.prod.yml に追記する例（トークンは .env の CF_TUNNEL_TOKEN に）
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on: [web]
```

Tunnel の **Public Hostname** 設定：

| Hostname | Service |
|---|---|
| `beta.example.com` | `http://web:80` |

これで `beta.example.com` は Cloudflare 経由でのみ `web` に届く。VPS に inbound を開ける必要はない（＝SR-137 の「ゲート経由でしか到達できない」を満たす）。

---

## 5. Cloudflare Access（operator だけ AI を使える）

Zero Trust → **Access → Applications**。**AI 経路と identity プローブだけ**を保護し、それ以外（SPA・図・表）は公開のまま残す。

### アプリ①：AI 経路（＝セキュリティ境界 / SR-137）

- Type: Self-hosted
- Application domain: `beta.example.com` / Path: `/n8n/webhook/*`
- Policy: **Allow** — Emails = `operator@example.com`（＝あなた 1 件）

### アプリ②：identity プローブ（＝SR-136 の判定材料）

- Application domain: `beta.example.com` / Path: `/auth/whoami`
- Policy: **Allow** — Emails = `operator@example.com`

> Access が認証したリクエストには `Cf-Access-Authenticated-User-Email` ヘッダが載る。Caddy はこれを見て `/auth/whoami` に `{"authenticated":true}` を返す（[deploy/Caddyfile](../../deploy/Caddyfile)）。**それ以外のパスは保護しない**ので、匿名訪問者は AI 抜きでアプリを使える。

### ログインの流れ

- 匿名でアクセス → チャット欄は出ない（`/auth/whoami` は Access に弾かれ 401 相当 → フロントは AI off）。
- operator が `https://beta.example.com/auth/whoami` を一度ブラウザで開く → Cloudflare のログイン → 認証後は同ドメインに Access セッション cookie が付く → 以降 SPA の `/auth/whoami` 取得が 200 になり**チャット欄が出る**。
- （任意の改善）SPA に「Sign in」リンクを足し、この導線をワンクリック化できる。ベータ（operator 1 名）では手動で十分。

---

## 6. n8n の初期設定（エディタは公開しない）

n8n エディタは web に晒していない。SSH ポートフォワードで一時的に触る：

```bash
ssh -L 5678:localhost:5678 root@<vps-ip>
# → 手元のブラウザで http://localhost:5678 を開く（初回は owner アカウント作成）
```

やること：

1. **ワークフロー取込**: [n8n/workflows/](../../n8n/workflows/) の JSON を import（chat リレー、Slack リレー read/write）。
2. **AI プロバイダの Credential 登録**: n8n の Credentials に API キーを入れる（コード・env には置かない）。実サーバは **OpenAI（`gpt-5.5`）** を使用。**プロバイダ側で課金上限（budget cap）を必ず設定**。
3. **Slack を使うなら**: `SLACK_RELAY_CHANNEL_ID` を n8n に渡す（[slack-setup.md](slack-setup.md) 参照）。使わないなら未設定でよい（中継は無効のまま）。

---

## 7. 動作確認 / Verification

| 確認 | 期待 |
|---|---|
| 匿名で `https://beta.example.com` | アプリは開く。**チャット欄は出ない**。図・表・マーカーは動く |
| `/plantuml/svg/<enc>` が図を返す | SVG 表示される |
| operator でログイン後に再訪 | **チャット欄が出る**。AI に送ると返信が来る |
| `https://beta.example.com/n8n/`（エディタ）に匿名アクセス | Access に弾かれる／SPA にフォールバック（**エディタは見えない**） |
| Gemini 課金 | 上限が効いている |

---

## 8. 運用メモ

- **更新（通常はこれだけ）**: 手元のリポジトリのルートで **`./deploy/deploy.sh`**。
  ソース同期 → web 再ビルド → スタック再起動 → 動作確認まで自動。詳細は [deploy/ENVIRONMENT.md](../../deploy/ENVIRONMENT.md)。
  ※ このサーバは git チェックアウトではないので `git pull` は使えません。
- **手作業で操作する場合の compose**（実サーバは 3 ファイル・プロジェクト名 `modellogue`）:
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.override.yml <...>`
- **停止**: 上記 compose に `down`（n8n データは named volume `n8n_data` に残る）
- **バックアップ**: `n8n_data` volume（Credentials・ワークフロー・Slack バッファ）を控える
- **プロバイダ差し替え（NFR-091）**: 認証を別のもの（自前 forward-auth / OIDC / 社内 SSO）に変える場合も、`/auth/whoami` が同じ contract（identity ヘッダ→`authenticated:true/false`）を返すよう手前の部品を差し替えるだけ。n8n・SPA は不変。

---

## 9. スコープ外（今回はやらない）

- 汎用 OIDC / 自前ログインの実装（NFR-091：不要な先回り。必要になった現場が継ぎ目で差し替える）
- CI/CD、監視の作り込み、i18n（一般公開の手前で検討）
