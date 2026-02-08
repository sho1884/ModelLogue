# ModelLogue - プロジェクトガイドライン

## プロジェクト概要

**ModelLogue** は、ソフトウェア開発におけるモデルレビューを支援する次世代型プラットフォームです。
モデル図を「一時的な思考のキャンバス（Volatile Canvas）」と位置づけ、人間とAIの「対話ログ」を設計の本質的な資産として扱います。

## 作業方針

### ドキュメント・ファースト

- 十分なドキュメント（要求仕様書・アーキテクチャ設計書）が完成するまで、本番のコーディングは開始しない
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
│   │   ├── user_requirements.yaml
│   │   ├── system_requirements.yaml
│   │   └── requirements.md     # Markdownビュー（YAMLを参照）
│   ├── architecture.md         # アーキテクチャ設計書
│   ├── Security_Design.md      # セキュリティ設計書
│   └── traceability/           # トレーサビリティ図（Mermaid）
├── n8n/
│   └── workflows/              # n8n workflow templates (JSON)
├── Prototype/                  # プロトタイプコード（本番とは隔離）
├── docker-compose.yml          # PlantUML Server + n8n
└── src/                        # 本番ソースコード（設計完了後に着手）
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
- View: Markdown files referencing YAML
- Traceability: Mermaid diagrams for visual review

### Writing Style (Value Engineering)

- User Requirements: Task expressions ("Review the graph")
- System Requirements: Verb + Object ("Create a node on canvas")
- Rule Scenarios: Context → Action → Outcome

## Internationalization

- UI: English and Japanese
- Use i18next for translation
- DSL keywords: English only (no localization)

## 技術スタック

### 基本方針: フロントエンドは純粋なUI + n8nがオーケストレーター

- フロントエンド（SPA）は純粋なUIであり、秘密情報（APIキー等）を一切持たない
- データ格納・AI連携・外部サービス連携はすべてn8nが担う
- オープンソース（MIT License）＋セルフホスト可能

| レイヤー | 技術 | 用途 |
|---------|------|------|
| フロントエンド | React + TypeScript | SPA（純粋なUI） |
| UIライブラリ | React Flow | モデル図の表示・インタラクション |
| オーケストレーター | n8n (Docker) | AI中継・外部サービス連携・APIキー管理 |
| 推論エンジン | Gemini 2.5 Flash API | AI対話・改善提案（n8n経由） |
| 描画エンジン | PlantUML Server (Docker) | PlantUMLソース → SVG変換 |
| 国際化 | i18next | 英語・日本語 UI |

### 外部サービス連携（すべてn8n経由）

- **n8n**: オーケストレーター（Docker セルフホスト、Phase 1から導入）
- **PlantUML Server**: Docker セルフホスト（フロントエンドから直接接続）
- **Gemini API**: n8n経由で中継（APIキーはn8n側で管理）
- **Slack/Teams/Discord**: n8n経由で非同期フィードバック収集（Phase 2〜、任意）
- **GitHub API**: n8n経由でソース＋会話ログの自動パブリッシュ（Phase 3）

## 実装ロードマップ

1. **Phase 1 (MVP)**: PlantUMLソース受領・表示 + n8n経由AI対話型修正の基本フロー
2. **Phase 2 (Collaborative)**: React Flow要素ポインティング + n8n経由Slack/Teams/Discord連携
3. **Phase 3 (Enterprise)**: n8n経由GitHub自動コミット＋業務フロー統合

## コーディング規約

- 言語: TypeScript（strict mode）
- フォーマッター: Prettier
- リンター: ESLint
- テスト: Vitest
- コンポーネント: 関数コンポーネント + Hooks
- 状態管理: 必要に応じてZustand等の軽量ライブラリ

## Security

### Policy

- Follow OWASP Top 10 (latest version) guidelines
- See `Doc/Security_Design.md` for detailed security design

### Key Rules

- **Never use `eval()` or `Function()` with user input**
- **Never use `dangerouslySetInnerHTML` with user input**
- Validate all DSL input through parser (no direct execution)
- Sanitize node labels before rendering
- Keep dependencies updated (`npm audit`)

### Vercel Best Practices

- Security headers configured in `vercel.json`
- HTTPS enforced (automatic)
- No secrets in code (use environment variables)

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
