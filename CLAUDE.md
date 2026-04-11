# ModelLogue - プロジェクトガイドライン

## プロジェクト概要

**ModelLogue** は、ソフトウェア開発におけるモデルレビューを支援するプラットフォームです。
モデル図を「一時的な思考のキャンバス（Volatile Canvas）」と位置づけ、人間とAIの「対話ログ」を設計の本質的な資産として扱います。

現在のスコープは**状態遷移図のレビュー**に集中しています。NeoCEGと同じ「テキスト→正規モデル→図＋表」パターンで、PlantUMLサブセット→StateMachineModel→PlantUML SVG（マーカーオーバーレイ付き）＋状態遷移マトリクスのパイプラインを構築します。

## 作業方針

### ドキュメント・ファースト

- 十分なドキュメント（要求仕様書・アーキテクチャ設計書）が完成するまで、本番のコーディングは開始しない
- **ドキュメントの変更を常に実装より先行させる**
- **重要な技術的判断は ADR として記録する**（[`Doc/adr/`](Doc/adr/) 配下のYAML、[`Doc/ADR_Index.md`](Doc/ADR_Index.md) は自動生成のビュー）。ADRの作成・更新は `adr` スキル経由で行う
- 例外: 実装レベルの試行錯誤が必要な場合のみ、Prototype/で検証してから文書を修正してもよい
- ドキュメントは `Doc/` ディレクトリに格納する
- 企画・参考資料は `Reference/` ディレクトリに格納する

### ディレクトリ構成ルール

```
ModelLogue/
├── CLAUDE.md                   # 本ファイル（プロジェクトガイドライン）
├── LICENSE                     # MIT License
├── Reference/                  # 企画書・参考資料（変更しない）
├── Doc/                        # 設計ドキュメント
│   ├── requirements/           # 要求仕様（YAML + Markdown）
│   │   ├── Requirements_Specification.md  # Markdownビュー
│   │   ├── user_requirements.yaml
│   │   ├── system_requirements.yaml
│   │   ├── nonfunctional_requirements.yaml
│   │   └── test_strategy.yaml
│   ├── Traceability.md         # トレーサビリティ（Mermaid系統図＋マトリクス）
│   ├── architecture.md         # アーキテクチャ設計書
│   └── Security_Design.md      # セキュリティ設計書
├── n8n/
│   └── workflows/              # n8n workflow templates (JSON)
├── Prototype/                  # プロトタイプコード（本番とは隔離）
├── docker-compose.yml          # PlantUML Server + n8n
├── src/                        # 本番ソースコード
│   ├── components/             # React コンポーネント
│   ├── parsers/                # PlantUMLサブセットパーサー
│   ├── engines/                # 純粋アルゴリズム（マトリクス生成、SVG座標抽出）
│   ├── services/               # 外部サービス連携（PlantUML, n8n）
│   ├── stores/                 # Zustand ストア
│   ├── types/                  # TypeScript 型定義
│   ├── grammars/               # EBNF 静的定義
│   └── i18n/                   # 国際化リソース
└── tests/                      # テスト（unit, golden）
```

### プロトタイプ

- 技術検証用のプロトタイプは `Prototype/` ディレクトリに作成する
- 本番ソース（`src/`）とは厳密に分離する
- プロトタイプのコードを本番に持ち込む場合は、設計に基づいて書き直す

## Documentation Standards

### Language Policy

- **Review language**: Japanese（レビューは日本語で実施）
- **Requirements data (YAML)**: English
- **Requirements spec (Markdown)**: Bilingual (English + Japanese)
- **Traceability diagrams**: Include function names, not just IDs
- **Code comments**: English
- **Commit messages**: English

### Requirements Documents

- Data: YAML files in `Doc/requirements/`
- View: `Requirements_Specification.md` referencing YAML
- Traceability: `Traceability.md` with Mermaid diagrams and matrix

### Writing Style (Value Engineering)

- User Requirements: Task expressions ("Review the diagram")
- System Requirements: Verb + Object ("Parse PlantUML subset")
- Rule Scenarios: Context → Action → Outcome (not Gherkin)

## Internationalization

- UI: English and Japanese
- Use i18next for translation
- PlantUML keywords: English only (no localization)

## 技術スタック

### 基本方針

- フロントエンド（SPA）は秘密情報（APIキー等）を一切持たない
- **意味解析・テーブル生成はフロントエンドのパーサー＋アルゴリズム**で実行（LLM不要）
- AI対話の中継はn8nが担う
- オープンソース（MIT License）＋セルフホスト可能

| レイヤー | 技術 | 用途 |
|---------|------|------|
| フロントエンド | React + TypeScript | SPA |
| 図の表示 | ネイティブSVG | PlantUML SVGをそのまま表示＋ネイティブSVGマーカーオーバーレイ |
| ソースエディタ | CodeMirror | PlantUMLソース編集 |
| 状態管理 | Zustand | ストア管理 |
| 図の生成 | PlantUML Server (Docker) | PlantUMLソース → SVG（表示＋座標抽出） |
| AI対話中継 | n8n (Docker) | Gemini API中継・APIキー管理 |
| 国際化 | i18next | 英語・日本語 UI |

### 外部サービス連携

- **PlantUML Server**: Docker セルフホスト（SVG生成 → 直接表示＋座標抽出）
- **n8n**: Docker セルフホスト（AI対話中継、APIキー管理）
- **Gemini API**: n8n経由で中継（APIキーはn8n側で管理）

### マーカーUI

- 楕円・矩形・矢印の3種類
- 4色固定パレット（赤・青・緑・紫）、未使用色を自動割当
- ドラッグで描画、選択→ハンドルで移動・リサイズ、DELキーまたは右クリックで削除
- ネイティブSVGで自前実装（外部ホワイトボードフレームワーク不使用）

### PlantUMLサブセットの範囲

ModelLogueはPlantUML完全互換ではなく、レビュー目的に絞った最小サブセットをサポートする。

**サポートする構文**:
- 状態と遷移、初期/終了擬似状態、状態の別名
- イベント、ガード、アクション付き遷移
- **1階層の複合状態**（`state X { ... }`）と、その中の内部初期遷移
- 複合状態を source とするグループ脱出遷移
- 複合状態を target とする進入遷移（内部の初期状態へ）

**サポートしない構文**（構文エラーで拒否、ADR-009 参照）:
- 入れ子の入れ子（複合状態の中に複合状態）
- 直交領域（並行状態、`--` 区切り）
- ヒストリ擬似状態（`[H]`、`[H*]`）
- ドット記法による直接進入（`X.Y`）
- entry/exit point擬似状態
- スタイル、色、ノート

詳細は [Doc/requirements/Requirements_Specification.md](Doc/requirements/Requirements_Specification.md) §3.1 を参照。

## コーディング規約

- 言語: TypeScript（strict mode）
- フォーマッター: Prettier
- リンター: ESLint
- テスト: Vitest + React Testing Library
- コンポーネント: 関数コンポーネント + Hooks
- 状態管理: Zustand
- CSS: Tailwind CSS

## Security

### Policy

- Follow OWASP Top 10 (latest version) guidelines
- See `Doc/Security_Design.md` for detailed security design

### Key Rules

- **Never use `eval()` or `Function()` with user input**
- **Never use `dangerouslySetInnerHTML` with user input**
- Validate all PlantUML input through parser (no direct execution)
- Sanitize labels before rendering on the diagram view
- Keep dependencies updated (`npm audit`)

### AI-Generated Code Risks

When using AI assistance for code generation:
- **Verify all suggested dependencies** before installing (check npm registry, GitHub stars, last update date)
- **Never blindly trust AI-suggested URLs or external resources**
- **Review generated code for injection vulnerabilities** (eval, innerHTML, SQL, shell commands)
- **Check for supply chain attacks** - verify package names are spelled correctly (typosquatting)
- **Validate security-sensitive logic** - authentication, authorization, encryption
- Be aware of **prompt injection** in any user input that may be processed by AI

## Licensing

### Project License

- ModelLogue is released under the **MIT License**
- All contributions must be MIT-compatible

### Dependency License Policy

**CRITICAL**: Before adding any new dependency:
1. **Check the license** - Only MIT, Apache-2.0, BSD, ISC, or similarly permissive licenses are allowed
2. **Avoid GPL/LGPL/AGPL** - These are NOT compatible with MIT for this project
3. **Record in requirements spec** - All dependencies must be listed in `Doc/requirements/system_requirements.yaml`
4. **Verify package authenticity** - Check npm registry, GitHub stars, last update date to avoid typosquatting

### Prohibited

- GPL, LGPL, AGPL licensed code (copyleft is incompatible)
- Code copied from Stack Overflow without license verification
- Proprietary or unlicensed code
- Dependencies with unclear or missing licenses

### Current Dependencies (MIT-compatible)

See `Doc/requirements/system_requirements.yaml` for the full list with license information.

## Git Workflow

- Main branch: `master`
- Commit messages: English, descriptive
- Co-author tag for AI-assisted commits
