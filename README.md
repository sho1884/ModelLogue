# ModelLogue

A platform for reviewing software-design models. It treats the diagram as a disposable **"volatile canvas"** and the human–AI **review dialogue** as the real design asset.

**ソフトウェア開発におけるモデルレビューを支援するプラットフォーム**です。モデル図を「一時的な思考のキャンバス（**Volatile Canvas**）」と位置づけ、人間とAIの**対話ログ**を設計の本質的な資産として扱います。

**Live Demo / デモ（限定公開ベータ）**: [modellogue.com](https://modellogue.com) — everything but AI chat is open to try / AIチャット以外は誰でも試せます

![ModelLogue review screen: diagram, state-transition matrix, N-switch test cases, and AI dialogue in one view / レビュー画面：状態遷移図・マトリクス・N-switch テストケース・AI対話を一画面で](Doc/manual/assets/Screenshot_Stopwatch1.png)

<sub>Diagram on the left (draw markers on it), state-transition matrix and N-switch test cases below, design-review dialogue with the AI on the right. The diagram is disposable; the dialogue log is the asset. / 左に図（マーカー描画可）、下に状態遷移マトリクスと N-switch テストケース、右に AI との設計レビュー対話。図は使い捨て、対話ログが資産。</sub>

## Concept / コンセプト

The diagram is a work-in-progress of thought (disposable); the **dialogue** exchanged during review is what should be kept as the rationale for design decisions.

図そのものは思考の途中経過（＝使い捨て可能）であり、レビューで交わされた**対話**こそが設計判断の根拠として残すべき資産である、という考え方に基づいています。

Every model type follows the same **"text → canonical model → diagram + tables"** pattern and shares one review UX (source view, AI dialogue, markers, Apply/Undo of proposals, Save & finish). Semantic analysis and table generation run entirely in the **front-end parser + algorithms** — no LLM required.

いずれのモデル型も **「テキスト → 正規モデル → 図＋表」** という同じパターンを踏襲し、同一のレビュー UX（ソース表示・AI対話・マーカー・提案の Apply/Undo・Save & finish）で扱えます。意味解析と表生成は**フロントエンドのパーサー＋アルゴリズム**で完結し、LLM を必要としません。

## Supported Model Types / サポートするモデル型

| Type / モデル型 | Input DSL / 入力 DSL | Output / 生成物 |
|---|---|---|
| **State machine** / 状態遷移図 | PlantUML subset / サブセット | PlantUML SVG (with marker overlay) + state-transition matrix + N-switch test cases / マーカーオーバーレイ付き＋状態遷移マトリクス＋N-switch テストケース |
| **Requirement** / 要求図 | SysML-style DSL (`!procedure` macro calls) / SysML 風 DSL | PlantUML SVG + traceability matrix + orphan-requirement list / トレーサビリティマトリクス＋孤立要求リスト |
| **Process** / プロセス図 | PlantUML activity subset / サブセット | PlantUML SVG + lanes / events / branches / レーン・イベント・分岐の可視化 |

The model type is fixed per session, and new types (a 4th and beyond) are added under `src/modelTypes/<type>/` ([ADR-012](Doc/adr/ADR-012-model-type-plugin-architecture.yaml)).

モデル型はセッションごとに固定され、`src/modelTypes/<type>/` 配下の追加で 4 型目以降も導入できる構造です（[ADR-012](Doc/adr/ADR-012-model-type-plugin-architecture.yaml)）。

## ⌨️ CLI: N-switch Test-Case Generator / N-switch テストケース生成（GUI 不要）

The part that generates **N-switch coverage test cases** from a state machine is also a **standalone Python CLI** ([tools/nswitch/](tools/nswitch/)), independent of the GUI. It takes a PlantUML source or a state-transition-table CSV and writes a test-case CSV to stdout.

状態遷移図から **N-switch カバレッジのテストケース**を生成する部分は、GUI と独立した**スタンドアロンの Python CLI**（[tools/nswitch/](tools/nswitch/)）としても使えます。PlantUML ソースまたは状態遷移表 CSV を入力に、テストケース CSV を標準出力へ吐きます。

```bash
pip install ./tools/nswitch

# State machine → 1-switch test-case CSV / 状態遷移図 → 1-switch テストケース CSV
modellogue-nswitch machine.puml -n 1

# 2-switch, plus negative tests for invalid transitions / 2-switch ＋ 無効遷移の負のテスト
modellogue-nswitch machine.puml -n 2 --invalid -o tests.csv

# Scenario form, with a scope name / シナリオ形式で、スコープ名を付けて
modellogue-nswitch machine.puml --scenarios --name Stopwatch

# Run as a long-lived HTTP API (called by the GUI / CI; also started by docker compose)
# HTTP API として常駐（GUI や CI から呼ぶ。docker compose でも起動）
modellogue-nswitch serve --port 8090
```

`-n` is 0 / 1 / 2 (default 1). The input format (`puml` / `csv`) is auto-detected, or forced with `--format`. To run without installing: `cd tools/nswitch && PYTHONPATH=src python -m modellogue_nswitch ...`. Full contract: [tools/nswitch/Requirements_Specification.md](tools/nswitch/Requirements_Specification.md) (ADR-010).

`-n` は 0 / 1 / 2（既定 1）。入力形式（`puml` / `csv`）は自動判別、`--format` で明示も可能。インストールせずに動かす場合は `cd tools/nswitch && PYTHONPATH=src python -m modellogue_nswitch ...`。契約の詳細は [tools/nswitch/Requirements_Specification.md](tools/nswitch/Requirements_Specification.md)（ADR-010）。

## Architecture / アーキテクチャ

- **The SPA holds no secrets.** API keys are managed on the n8n side. / **フロントエンド（SPA）は秘密情報を一切持たない。** APIキーは n8n 側で管理します。
- AI dialogue is relayed by **n8n**; semantic analysis and table generation stay inside the SPA. / AI対話の中継は **n8n** が担い、意味解析・表生成は SPA 内で完結します。

| Layer / レイヤー | Technology / 技術 |
|---|---|
| Front-end / フロントエンド | React + TypeScript (strict) + Zustand + Tailwind CSS |
| Source editor / ソースエディタ | CodeMirror |
| Diagram display / 図の表示 | Native SVG (PlantUML SVG + custom SVG marker overlay) / ネイティブSVG |
| Diagram generation / 図の生成 | PlantUML Server (Docker) |
| AI relay / AI対話中継 | n8n (Docker) |

See [Doc/architecture.md](Doc/architecture.md) and [Doc/requirements/Requirements_Specification.md](Doc/requirements/Requirements_Specification.md) for details. / 詳細は左記を参照してください。

## Getting Started / はじめに

Prerequisites: Docker / Docker Compose, Node.js. / 前提: Docker / Docker Compose、Node.js。

```bash
# 1. Start the backend (PlantUML Server + n8n + N-switch API)
#    バックエンドを起動
docker compose up -d

# 2. Front-end / フロントエンド
npm install
cp .env.example .env.local   # edit as needed / 必要に応じて編集
npm run dev
```

The Vite dev server proxies `/plantuml` `/n8n` `/nswitch` to the Docker services ([vite.config.ts](vite.config.ts)); this is enough to see diagrams. / Vite の開発サーバが各 Docker サービスへプロキシします。図の表示まではこれだけで動きます。

To enable **AI chat**, import the workflows in [n8n/workflows/](n8n/workflows/) into n8n (http://localhost:5678) and configure an LLM credential. To pass the AI gate locally, set `AUTHGATE_ALLOW_INSECURE=1` in `.env.local` (always `0` in production). See [Doc/setup_guide.md](Doc/setup_guide.md).

**AIチャット**を動かすには、n8n に [n8n/workflows/](n8n/workflows/) のワークフローを取り込み、LLM の Credential を設定してください。ローカルで AI ゲートを通す場合は `.env.local` に `AUTHGATE_ALLOW_INSECURE=1` が必要です（本番では必ず `0`）。手順は [Doc/setup_guide.md](Doc/setup_guide.md) を参照。

### Common scripts / よく使うスクリプト

```bash
npm run dev        # dev server / 開発サーバ
npm run build      # typecheck + production build / 型チェック＋本番ビルド
npm test           # unit tests (Vitest) / ユニットテスト
npm run test:e2e   # E2E (Playwright)
npm run lint       # ESLint
```

## Project Structure / ディレクトリ構成

```
src/
├── components/     React components (model-type agnostic) / モデル型非依存
├── modelTypes/     Model-type plugins (state-machine / requirement / process)
├── engines/        Model-type-agnostic pure algorithms (SVG coord extraction, ...)
├── services/       External-service integration (PlantUML, n8n, nswitch, marker)
├── stores/         Zustand stores
└── grammars/       EBNF definitions per model-type subset
tools/nswitch/      N-switch coverage test-case generator (Python CLI + HTTP API)
Doc/                Requirements, architecture, ADRs, security design
```

## Documentation / ドキュメント

- [Requirements Specification / 要求仕様書](Doc/requirements/Requirements_Specification.md)
- [Architecture / アーキテクチャ設計書](Doc/architecture.md)
- [Security Design / セキュリティ設計書](Doc/Security_Design.md)
- [ADR Index / ADR 一覧](Doc/ADR_Index.md)
- [Traceability / トレーサビリティ](Doc/Traceability.md)

## License / ライセンス

[MIT License](LICENSE) © 2026 sho1884
