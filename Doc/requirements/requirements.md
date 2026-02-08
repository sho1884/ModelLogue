# ModelLogue Requirements Specification / 要求仕様書

**Version / バージョン**: 1.0
**Date / 作成日**: 2026-02-08
**Status / ステータス**: Draft / ドラフト

> **Data source / データソース**: This document is a bilingual view of the YAML requirement files.
> 本ドキュメントはYAML要求定義ファイルのバイリンガルビューです。
>
> - [`user_requirements.yaml`](./user_requirements.yaml) — User Requirements / ユーザー要求
> - [`system_requirements.yaml`](./system_requirements.yaml) — System Requirements / システム要求

---

## 1. Purpose / 目的

This document defines functional and non-functional requirements for ModelLogue, organized by implementation phase (Phase 1 MVP → Phase 3 Enterprise).

本書は、ModelLogueの機能要求および非機能要求を定義する。企画書（`Reference/ModelLogue企画書.pdf`）に基づき、Phase 1（MVP）〜 Phase 3（Enterprise）の要求を段階的に整理する。

## 2. System Overview / システム概要

ModelLogue is a web application that supports model reviews in software development.

ModelLogueは、ソフトウェア開発におけるモデルレビューを支援するWebアプリケーションである。

**Core Concepts / コア・コンセプト**:
- Model diagrams are "Volatile Canvas" — temporary, not the final deliverable / モデル図は「一時的な思考のキャンバス」であり最終成果物ではない
- Human-AI "dialogue logs" are treated as the essential design asset / 人間とAIの「対話ログ」を設計の本質的な資産として扱う
- "Lean architecture" — orchestrate external services, don't own functionality / 機能を抱え込まず外部サービスをオーケストレーションする「持たないアーキテクチャ」

## 3. Roles / ユーザーとロール

| Role / ロール | Description / 説明 |
|---|---|
| Reviewer / レビューア | Reviews model diagrams and provides feedback / モデル図を確認しフィードバックを提供する |
| Model Author / モデル作成者 | Creates PlantUML source and requests reviews / PlantUMLソースを作成・投入しレビューを依頼する |
| AI (Gemini) | System actor that proposes improvements through dialogue / 対話を通じて改善案を提案するシステムアクター |

## 4. User Requirements / ユーザー要求

> Writing style: Task expressions / 記述スタイル: タスク表現
> Data source: [`user_requirements.yaml`](./user_requirements.yaml)

### Phase 1 (MVP)

| ID | Title / タイトル | Description / 説明 | Role |
|---|---|---|---|
| UR-1.1 | Edit PlantUML source / PlantUMLソースを編集する | Edit PlantUML source code with syntax highlighting in the browser / ブラウザでシンタックスハイライト付きのPlantUMLソースを編集する | Author |
| UR-1.2 | Preview the model diagram / モデル図をプレビューする | Preview the PlantUML diagram as SVG in real-time while editing / 編集中にPlantUML図をリアルタイムでSVGプレビューする | Author |
| UR-1.3 | Discuss the model with AI / AIとモデルについて対話する | Have a natural language conversation with AI about the model diagram / モデル図についてAIと自然言語で対話する | Reviewer |
| UR-1.4 | Apply AI suggestions / AIの提案を適用する | Apply AI-proposed PlantUML modifications with one click / AIが提案したPlantUML修正をワンクリックで適用する | Author |
| UR-1.5 | Review dialogue history / 対話履歴を確認する | Browse the full dialogue history of the current session / 現在のセッションの全対話履歴を閲覧する | Reviewer |
| UR-1.6 | Export the review session / レビューセッションをエクスポートする | Export the review session as a file / レビューセッションをファイルとしてエクスポートする | Author |

### Phase 2 (Collaborative)

| ID | Title / タイトル | Description / 説明 | Role |
|---|---|---|---|
| UR-2.1 | Interact with diagram elements / 図の要素を操作する | Select and interact with individual elements of the model diagram / モデル図の個別要素を選択しインタラクションする | Reviewer |
| UR-2.2 | Point and review / ポインティング・レビューする | Point at specific diagram elements to leave review comments / 図の要素を指差ししてレビューコメントを付ける | Reviewer |
| UR-2.3 | Provide feedback via chat apps / チャットアプリ経由でフィードバックする | Send feedback asynchronously via Slack/Teams/Discord (n8n relay) / Slack/Teams/Discord経由で非同期にフィードバック（n8n中継） | Reviewer |

### Phase 3 (Enterprise)

| ID | Title / タイトル | Description / 説明 | Role |
|---|---|---|---|
| UR-3.1 | Publish review to GitHub / レビューをGitHubに公開する | Auto-commit model source and dialogue log to GitHub upon approval / 承認時にモデルソース＋対話ログをGitHubへ自動コミットする | Author |
| UR-3.2 | Integrate with business workflows / 業務フローに統合する | Integrate the review process with existing workflows via n8n / n8n経由でレビュープロセスを業務フローに統合する | Author |

## 5. System Requirements (Phase 1) / システム要求（Phase 1）

> Writing style: Verb + Object / 記述スタイル: 動詞＋目的語
> Data source: [`system_requirements.yaml`](./system_requirements.yaml)

| ID | Title | Function | Traces to |
|---|---|---|---|
| FR-1.1 | Render PlantUML editor with syntax highlighting | `PlantUmlEditor` | UR-1.1 |
| FR-1.2 | Encode PlantUML source for server request | `encodePlantUml` | UR-1.2 |
| FR-1.3 | Fetch SVG from PlantUML Server | `PlantUmlService.renderSvg` | UR-1.2 |
| FR-1.4 | Display SVG preview with pan and zoom | `SvgPreview` | UR-1.2 |
| FR-1.5 | Send chat message to AI via n8n | `N8nService.chat` | UR-1.3 |
| FR-1.6 | Render chat message list | `MessageList` | UR-1.3, UR-1.5 |
| FR-1.7 | Extract PlantUML source from AI response | `parseAiResponse` | UR-1.4 |
| FR-1.8 | Display source diff for AI proposals | `SourceDiffView` | UR-1.4 |
| FR-1.9 | Apply proposed source modification | `SessionStore.applyProposal` | UR-1.4 |
| FR-1.10 | Undo source modification | `SessionStore.undoSource` | UR-1.4 |
| FR-1.11 | Export session as JSON | `ExportService.exportAsJson` | UR-1.6 |
| FR-1.12 | Check PlantUML Server health | `PlantUmlService.checkHealth` | UR-1.2 |
| FR-1.12b | Check n8n connectivity | `N8nService.checkHealth` | UR-1.3 |
| FR-1.13 | Manage session state | `SessionStore` | UR-1.1, UR-1.3, UR-1.5 |

## 6. Non-Functional Requirements / 非機能要求

| ID | Category / カテゴリ | Key Requirements / 主要要件 |
|---|---|---|
| NFR-1 | Performance / パフォーマンス | SVG preview < 2s, AI first token < 5s (streaming), UI < 100ms |
| NFR-2 | Security / セキュリティ | No secrets in frontend, all API calls via n8n, OWASP Top 10, input sanitization |
| NFR-3 | Usability / ユーザビリティ | Responsive (desktop-first), dark mode, keyboard shortcuts, i18n (EN/JA) |
| NFR-4 | Availability / 可用性 | Static SPA hosting, PlantUML/n8n health check, offline notification, self-hosted (Docker Compose) |
| NFR-5 | Extensibility / 拡張性 | All PlantUML diagram types, future Mermaid support, plugin architecture |

## 7. Screen Layout (Phase 1) / 画面構成（Phase 1）

```
┌──────────────────────────────────────────────────────────────┐
│  Header (Logo / Session Name / Export)                        │
│  ヘッダー（ロゴ / セッション名 / エクスポート）                    │
├────────────────┬──────────────────┬──────────────────────────┤
│                │                  │                          │
│  PlantUML      │  SVG Preview     │  AI Chat Panel           │
│  Editor        │  (Pan/Zoom)      │  AIチャットパネル           │
│  エディタ       │  SVGプレビュー    │                          │
│                │                  │  ┌──────────────────┐    │
│                │                  │  │ Message History   │    │
│                │                  │  │ 対話履歴           │    │
│                │                  │  │                    │    │
│                │                  │  ├──────────────────┤    │
│                │                  │  │ Input Area        │    │
│                │                  │  │ 入力エリア         │    │
│                │                  │  └──────────────────┘    │
├────────────────┴──────────────────┴──────────────────────────┤
│  Status Bar (PlantUML Server / n8n / AI Status)               │
│  ステータスバー（PlantUML Server / n8n接続状態 / AI状態）        │
└──────────────────────────────────────────────────────────────┘
```

## 8. Data Model / データモデル

```typescript
interface ReviewSession {
  id: string;
  name: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  plantUmlSource: string;  // Current PlantUML source
  messages: ChatMessage[];  // Dialogue history
  sourceHistory: SourceSnapshot[];  // Source change history
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;       // ISO 8601
  suggestedSource?: string; // AI-proposed PlantUML source (if any)
  applied?: boolean;        // Whether the proposal was applied
}

interface SourceSnapshot {
  id: string;
  source: string;
  timestamp: string;
  triggeredBy: string;     // "manual" or ChatMessage ID
}
```

## 9. External Interfaces / 外部インターフェース

### 9.1 PlantUML Server API

- **Endpoint**: `http://localhost:8080/svg/{encoded}` (Docker local)
- **Method**: GET
- **Input**: PlantUML source encoded with Deflate + Base64
- **Output**: SVG image

### 9.2 n8n Webhook (Chat Relay)

- **Endpoint**: `{n8n_base_url}/webhook/modellogue-chat`
- **Method**: POST
- **Input**: Current PlantUML source + conversation history + user message
- **Output**: AI text response (streaming via SSE)
- **Note**: n8n internally calls Gemini 2.5 Flash API with API key managed on n8n side

## 10. Constraints / 制約事項

- No data persistence in the tool itself (Volatile Canvas philosophy) / 本ツール自体はデータの永続化を行わない
- Session data lives only in browser memory / セッションデータはブラウザのメモリ上にのみ保持
- Export (Phase 1) or GitHub (Phase 3) for persistence / 永続化にはエクスポートまたはGitHub連携を使用
- Network connectivity to PlantUML Server and n8n is required / PlantUML Serverとn8nへのネットワーク接続が必須

## 11. Glossary / 用語集

| Term / 用語 | Definition / 定義 |
|---|---|
| Volatile Canvas | Temporary thinking canvas. Diagrams exist only during the session / 一時的な思考のキャンバス。セッション中のみ存在 |
| Review Evidence / レビュー証跡 | Set of model source + full dialogue log. Records the decision-making process / モデルソース＋全対話ログのセット |
| Review Hub | ModelLogue frontend UI / ModelLogueのフロントエンドUI |
| Pointing Review / ポインティング・レビュー | Review method by pointing at diagram elements / 図の要素を指差しして行うレビュー方式 |
