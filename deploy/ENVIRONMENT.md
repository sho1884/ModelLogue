# 本番（ベータ）環境の事実シート / Live Environment Facts

**まずこれを読んでください。** これは「今この瞬間に動いている環境」の説明です。
`Doc/Deploy_Runbook.md` と `Doc/operations/deployment.md` は「ゼロから立ち上げる手順」ですが、
実際の箱はそれらと一部違います（下記）。迷ったらこのファイルが正です。

デプロイのやり方は簡単です：**リポジトリのルートで `./deploy/deploy.sh` を実行するだけ**。
詳しくは末尾の「更新のしかた」を参照。

---

## この環境は何か

- **用途**: 限定公開ベータ ＝ デモ／ステージング相当。**数分止まっても問題ない**運用です。
- **公開URL**: https://modellogue.com
- **性質**: 誰でも AI 抜きで使える。AI チャットは**認証した operator（＝あなた／管理者）だけ**が使える。

---

## サーバの座標

| 項目 | 値 |
|---|---|
| プロバイダ | **XServer VPS**（2GB プラン）※ Hetzner ではありません |
| OS | Ubuntu 24.04 |
| サーバ IP | `162.43.92.10` |
| SSH | 鍵認証のみ（パスワード不可）。例では鍵ファイル名 `id_ed25519_modellogue` |
| コード置き場 | `/opt/modellogue` |
| コードの入り方 | **git ではありません**。手元のリポジトリから `rsync` で同期します（`git pull` は効きません） |

SSH の例：
```bash
ssh -i ~/.ssh/id_ed25519_modellogue root@162.43.92.10
```

### 鍵は2種類ある（用途で使い分ける）

| 鍵 | 接続先 | できること |
|---|---|---|
| `id_ed25519_modellogue` | `root@` | 何でも。**ツールのデプロイ専用**（compose の build/up が要るため） |
| `id_ed25519_modellogue_site` | `site@`（uid 1500） | **`/opt/sites` への rsync だけ**。シェル不可・他パス不可・読み出し不可 |

コンテンツ（静的サイト）を置くのに root は要りません。`site@` 側は
`/home/site/.ssh/authorized_keys` の
`command="/usr/bin/rrsync -wo /opt/sites",restrict` で拘束されています。
コンテンツを増やしても、この鍵はそのまま使えます（`/opt/sites/<name>` が増えるだけ）。

> **uid は 1500 固定です。** コンテナ（n8n・neoceg-api・pict）はホストから見て
> **uid 1000** で動き、`/opt/modellogue` と `/opt/neoceg` も uid 1000 所有です。
> `useradd` は既定で最小の空き uid（＝1000）を取るため、`-u` を省くと新ユーザーが
> それらを所有し、n8n と同一 uid になります。ユーザーを足すときは必ず高い uid を明示。

> **新しく参加する人へ**: 自分の SSH 公開鍵をサーバの `~/.ssh/authorized_keys` に追加してもらい、
> さらに自分のメールアドレスを Cloudflare Access のポリシー（AI を使える人の一覧）に追加してもらってください。
> この2つが済めば、あなたも SSH と AI 利用ができます。

---

## 動いているもの（Docker コンテナ 8 個）

`docker ps` で見えるはずのもの。すべて `/opt/modellogue` の docker compose で管理されています。

| コンテナ | 役割 | 公開ポート |
|---|---|---|
| `modellogue-web-1` | Caddy。SPA(`/app`) を配信し、`/plantuml` `/nswitch` `/pict` `/neoceg` `/n8n` `/auth` を各コンテナへ中継。サイトのルート(`/`) は `/opt/sites/modellogue-site` の `:ro` マウントを配信（相乗りコンテンツ） | `127.0.0.1:8088`（外部非公開） |
| `modellogue-n8n-1` | AI 中継。**OpenAI の API キーを保持**。エディタは非公開 | なし（ホスト非公開・内部のみ） |
| `modellogue-auth-verify-1` | Cloudflare Access の署名を検証（origin 側の二重ゲート、fail-closed） | なし |
| `modellogue-cloudflared-1` | Cloudflare Tunnel。外からはこれ経由でしか届かない | なし（外向き接続のみ） |
| `modellogue-plantuml-1` | PlantUML サーバ（SVG 生成）。秘密なし | なし |
| `modellogue-nswitch-api-1` | N-switch テスト生成。秘密なし | なし |
| `modellogue-pict-service-1` | **姉妹プロジェクト NeoCombi の PICT デモ API**（相乗り）。秘密なし | なし |
| `modellogue-neoceg-api-1` | **姉妹プロジェクト NeoCEG の原因結果グラフ デモ API**（相乗り）。秘密なし | なし |

- **外から開いているポートは SSH(22) だけ**。Web は Cloudflare Tunnel 経由でのみ到達します。ポートを新規に開けないこと。

### 相乗りしているもの（この箱は ModelLogue 専用ではない）

**この箱には色々載りますが、このリポジトリは ModelLogue というツールのものです。**
相乗りするものの実体は、すべて `/opt/modellogue` の**外**にあり、このリポジトリに入る
のは **Caddy のルート1箇所だけ**です。現状：

| path | 中身 | 実体の場所 | サービス定義 | ルート |
|---|---|---|---|---|
| `/pict` | NeoCombi の PICT デモ API（`/health`・`/generate?order=N`・`/decision-table`） | `/opt/pict-service` | `override.yml`（サーバ専用） | `handle_path /pict/*` |
| `/neoceg` | NeoCEG の原因結果グラフ デモ API（serve モード） | `/opt/neoceg` | `override.yml`（サーバ専用） | `handle_path /neoceg/*` |
| `/`（サイトのルート） | **modellogue.com のランディングページ**。静的コンテンツ。リポジトリは別（`ModelLogue-Site`）で、自前の `deploy.sh` を持つ | `/opt/sites/modellogue-site` | `override.yml` の `web.volumes`（`:ro` bind） | `handle {}`（catch-all） |
| `/checkout-benchmark` | **KASANE STORE 注文・決済ベンチマーク**。テスト設計練習用の純静的な模擬決済サイト（Cookie無し・外部通信無し）。リポジトリは別（`github.com/sho1884/checkout-benchmark`）で、自前の `deploy.sh` を持つ | `/opt/sites/checkout-benchmark` | `override.yml` の `web.volumes`（`:ro` bind） | `handle_path /checkout-benchmark/*`（+ 末尾スラッシュ308リダイレクト、CSP等ヘッダーをCaddyで付与） |

- **CLI をデモ API として足す型** → `deploy-cli-demo` スキル。
- **静的コンテンツを足す型** → `deploy-site-content` スキル。`site@` の制限鍵で
  `/opt/sites/<name>` に rsync し、`override.yml` で `:ro` マウント、Caddy にルート。
- どちらも `deploy.sh` を壊しません（実体は modellogue ツリー外、定義は rsync 除外の
  override、ルートだけが repo の Caddyfile）。

> **ここに `cp` してはいけません。** 2026-07-12、別フォルダで作ったランディングページが
> `deploy/landing/` にコピーされ、web イメージに焼き込まれ、作業ツリーから直接デプロイ
> されました。結果、**本番がどのリポジトリにも存在しないソースで3日間動き**、次にクリーンな
> clone から `deploy.sh` を叩けば `rsync --delete` がサイトを暫定版に巻き戻すところでした
> （しかも暫定版でも `GET / -> 200` なので、deploy.sh は成功と表示します）。
> 上の表の型に従えば、この事故は構造的に起きません。

---

## AI プロバイダ（重要）

- **OpenAI の `gpt-5.5`** を使っています。※ 手順書に出てくる **Gemini ではありません**（無料枠が実質使えず乗り換えました）。
- キーは **n8n の Credential** の中だけにあります（リポジトリにも `.env` にもソースにも置かない）。
- ワークフロー名は `modellogue-chat`。n8n エディタは Web に晒しておらず、**ホストポートも公開していません**（毎デプロイで起きていた 5678 のポート競合を根絶し、露出も無くすため。アプリは Docker ネットワーク内で n8n を叩くのでホスト公開は不要）。override.yml で `n8n.ports: !override []` により無効化。エディタを触るときは n8n コンテナの IP へ直接 SSH フォワード：
  ```bash
  # 1) n8n コンテナの IP を取得
  ssh -i ~/.ssh/id_ed25519_modellogue root@162.43.92.10 \
    "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' modellogue-n8n-1"
  # 2) その IP へフォワード（<ip> を置換）→ 手元のブラウザで http://localhost:5678
  ssh -i ~/.ssh/id_ed25519_modellogue -L 5678:<ip>:5678 root@162.43.92.10
  ```
  > **DNS の教訓**：n8n が外部（OpenAI 等）を解決できず `EAI_AGAIN` を出すときは、コンテナの `/etc/resolv.conf` が `127.0.0.53`（ホストの stub）になっている疑い。他コンテナと同じ `127.0.0.11`（Docker 埋め込み DNS）になるよう **n8n を作り直す**と直る（`… up -d --force-recreate n8n`）。

---

## docker compose の使い方（ここが手順書と違う）

このサーバは **compose ファイルを 3 つ重ねて** 使い、プロジェクト名は **`modellogue`** です。
1 ファイルだけで叩くと設定が抜けたり別スタックが二重に立つので、必ず 3 つ指定してください。

```bash
cd /opt/modellogue
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.override.yml \
  ps
```

- `docker-compose.yml` … 基本定義（リポジトリにある）
- `docker-compose.prod.yml` … 本番用。web のビルドと `127.0.0.1:${WEB_PORT}` バインド（リポジトリにある）
- `docker-compose.override.yml` … **サーバ専用**。メモリ制限・cloudflared・n8n の localhost 化。**リポジトリには無く、サーバにしか無い**

---

## 触ってはいけない / 上書きしてはいけないファイル（サーバ専用）

デプロイ（rsync 同期）はこの 2 つを**保護**しますが、手作業でも上書きしないこと：

- `/opt/modellogue/.env` … 実際の設定値・シークレット
- `/opt/modellogue/docker-compose.override.yml` … サーバ専用のオーバーライド

`.env` のキー（**値はここには書きません。シークレットです**）：

| キー | 意味 |
|---|---|
| `WEB_PORT` | web の内部ポート（既定 8088、localhost のみ） |
| `PUBLIC_BASE_URL` | `https://modellogue.com` |
| `TIMEZONE` | `Asia/Tokyo` |
| `CF_TEAM_DOMAIN` | Cloudflare Zero Trust のチーム名（`<team>.cloudflareaccess.com` の `<team>` 部分） |
| `CF_ACCESS_AUD` | Access アプリの AUD タグ（未設定でも可＝発行者チェックのみで運用） |
| `AUTHGATE_ALLOW_INSECURE` | 本番は必ず `0`（fail-closed）。`1` にするとゲートが無効になる — サーバでは絶対にしない |
| `TUNNEL_TOKEN` | Cloudflare Tunnel のトークン（**シークレット**） |

---

## 更新のしかた（デプロイ）

**手元のリポジトリのルートで、これ 1 行：**

```bash
./deploy/deploy.sh
```

これがやること（[deploy/deploy.sh](deploy.sh) の中身のとおり）：

1. 手元で型チェック＋ユニットテスト（壊れていたら止まる）
2. ソースをサーバへ `rsync` 同期（`.env` と `docker-compose.override.yml` は保護）
3. サーバで web イメージを再ビルド
4. スタック全体を `up -d` で再起動（n8n のポート競合を避けるため個別ではなく全体を上げます。**数十秒の瞬断が出ることがありますが、この環境では許容**）
5. 公開URLと AI ゲートの動作を自動確認（`GET / → 200`、未認証の AI 呼び出し → `302/403`）

サーバや鍵が変わったら、環境変数で上書きできます：
```bash
SERVER=root@<new-ip> SSH_KEY=~/.ssh/<key> ./deploy/deploy.sh
```

---

## 困ったときの確認コマンド

```bash
# 状態
ssh -i ~/.ssh/id_ed25519_modellogue root@162.43.92.10 'docker ps --format "{{.Names}}\t{{.Status}}"'

# ログ（例: web）
ssh -i ~/.ssh/id_ed25519_modellogue root@162.43.92.10 \
  'cd /opt/modellogue && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.override.yml logs --tail=100 web'

# 公開URLとゲートの手動チェック
curl -s -o /dev/null -w "%{http_code}\n" https://modellogue.com/                                  # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://modellogue.com/n8n/webhook/modellogue-chat \
  -H 'Content-Type: application/json' -d '{}'                                                       # 302 or 403（AIはゲート内）
```

- **AI 呼び出しが 200 を返したら要注意**（ゲートが開いている）。302/403 が正常です。
