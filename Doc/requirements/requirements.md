# ModelLogue Requirements Specification / 要求仕様書

**Version / バージョン**: 2.0
**Date / 作成日**: 2026-02-11
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
- Models have multiple representations: diagram, table, test cases, grammar / モデルは図・表・テストケース・文法など複数の表現を持つ

## 3. Roles / ユーザーとロール

| Role / ロール | Description / 説明 |
|---|---|
| Reviewer / レビューア | Reviews model diagrams and provides feedback / モデル図を確認しフィードバックを提供する |
| Model Author / モデル作成者 | Creates PlantUML source and requests reviews / PlantUMLソースを作成・投入しレビューを依頼する |
| AI (Gemini) | System actor that proposes improvements through dialogue / 対話を通じて改善案を提案するシステムアクター |

## 4. Screen Layout / 画面構成

```
┌──────────────────────────────────────────────────────────────┐
│  Header (Logo / Session Name / Export)                        │
│  ヘッダー（ロゴ / セッション名 / エクスポート）                    │
├──────────────────────────────────────┬───────────────────────┤
│                                      │                       │
│  Model Diagram (Primary View)        │  Chat / Review        │
│  モデル図（主役、最大領域）             │  Panel                │
│  (Pan / Zoom / Click)                │  チャット/レビュー      │
│                                      │  パネル               │
│                                      │                       │
├─ ─ ─ ─ ─ drag to resize ─ ─ ─ ─ ─ ─┤                       │
│  ▲ Analysis Panel (Pull-up, Tabbed)  │                       │
│  ┌──────┬───────┬──────────┬───────┐ │                       │
│  │Source│Table  │TestCases │EBNF   │ │                       │
│  ├──────┴───────┴──────────┴───────┤ │                       │
│  │  PlantUML source editor         │ │                       │
│  │  or analysis table/test cases   │ │                       │
│  └─────────────────────────────────┘ │                       │
├──────────────────────────────────────┴───────────────────────┤
│  Status Bar (PlantUML Server / n8n / AI Status)               │
│  ステータスバー                                                │
└──────────────────────────────────────────────────────────────┘
```

**Layout key points / レイアウトのポイント**:
- Model diagram is the primary view (center, largest area) / モデル図が主役（中央、最大領域）
- Analysis panel slides up from the bottom with tabs / 解析パネルは下からスライドアップ（タブ付き）
- Chat panel spans full height on the right / チャットパネルは右側で全高さに渡る
- Analysis panel is resizable and collapsible / 解析パネルはリサイズ・折りたたみ可能

**Analysis Panel tabs / 解析パネルのタブ**:

| Tab / タブ | Content / 内容 | Example / 例 |
|---|---|---|
| Source | PlantUML source editor / PlantUMLソースエディタ | Syntax-highlighted code editing |
| Table | Model-related analysis table / モデル関連の解析表 | State transition table, factor/level table / 状態遷移表、因子・水準表 |
| TestCases | Generated test cases / 生成されたテストケース | N-switch coverage / Nスイッチカバレッジ |
| EBNF | Constrained PlantUML grammar / 制限されたPlantUML文法 | Model-type-optimized EBNF grammar |

## 5. User Requirements / ユーザー要求

> Writing style: Task expressions / 記述スタイル: タスク表現
> Data source: [`user_requirements.yaml`](./user_requirements.yaml)

### Phase 1 (MVP) — Core Review Platform / コアレビュー基盤

| ID | Title / タイトル | Description / 説明 | Role |
|---|---|---|---|
| UR-1.1 | Edit PlantUML source / PlantUMLソースを編集する | Edit source in the analysis panel's Source tab / 解析パネルのSourceタブでソースを編集する | Author |
| UR-1.2 | Preview the model diagram / モデル図をプレビューする | Preview as SVG in the primary view area (center, largest) / 主要領域（中央、最大）でSVGプレビュー | Author |
| UR-1.3 | Discuss the model with AI / AIとモデルについて対話する | Chat with AI in the right panel about diagram and analysis views / 右パネルで図と解析ビューについてAIと対話 | Reviewer |
| UR-1.4 | Apply AI suggestions / AIの提案を適用する | Apply AI-proposed modifications with one click / AIの修正提案をワンクリックで適用 | Author |
| UR-1.5 | Review dialogue history / 対話履歴を確認する | Browse full dialogue history of the session / セッションの全対話履歴を閲覧 | Reviewer |
| UR-1.6 | Export the review session / セッションをエクスポートする | Export source + dialogue log + artifacts as JSON / ソース＋対話ログ＋成果物をJSONエクスポート | Author |
| UR-1.7 | Resize the analysis panel / 解析パネルをリサイズする | Drag to resize, collapse/expand the bottom panel / ドラッグでリサイズ、折りたたみ/展開 | Reviewer |

### Phase 2 (Analytical Review) — Model Analysis + Interactive / モデル解析＋インタラクティブ

| ID | Title / タイトル | Description / 説明 | Role |
|---|---|---|---|
| UR-2.1 | View analysis table / 解析表を見る | View tabular model representation (state transition table, factor/level table) in Table tab / Tableタブでモデルの表形式表現を表示 | Reviewer |
| UR-2.2 | View generated test cases / テストケースを見る | View derived test cases (N-switch coverage, etc.) in TestCases tab / TestCasesタブで導出テストケースを表示 | Reviewer |
| UR-2.3 | View EBNF grammar / EBNF文法を見る | View model-type-optimized constrained grammar in EBNF tab / EBNFタブでモデル種別最適化文法を表示 | Author |
| UR-2.4 | Navigate between views / ビュー間をナビゲートする | Bidirectional highlight: click diagram → highlight table, and vice versa / 双方向ハイライト連動 | Reviewer |
| UR-2.5 | Auto-detect model type / モデル種別を自動検出する | Auto-detect from PlantUML keywords and show relevant tabs / キーワードから自動検出し関連タブを表示 | Author |
| UR-2.6 | Interact with elements / 要素を操作する | Select elements via React Flow, attach comments, start AI dialogue / React Flowで要素選択・コメント付与・AI対話 | Reviewer |
| UR-2.7 | Point and review / ポインティング・レビューする | Point at elements to leave anchored review comments / 要素を指差ししてレビューコメント | Reviewer |

### Phase 3 (Collaborative + Enterprise) / コラボレーション＋エンタープライズ

| ID | Title / タイトル | Description / 説明 | Role |
|---|---|---|---|
| UR-3.1 | Feedback via chat apps / チャットアプリでフィードバック | Async feedback via Slack/Teams/Discord (n8n relay) / n8n中継でSlack/Teams/Discord非同期フィードバック | Reviewer |
| UR-3.2 | Publish to GitHub / GitHubに公開する | Auto-commit source + dialogue log + artifacts via n8n / n8n経由で自動コミット | Author |
| UR-3.3 | Business workflow integration / 業務フロー統合 | Integrate review process with workflows via n8n / n8n経由でレビュープロセスを業務フローに統合 | Author |

## 6. Supported Model Types / 対応モデル種別

| Model Type / モデル種別 | PlantUML | Analysis Table / 解析表 | Test Cases / テストケース |
|---|---|---|---|
| State Transition / 状態遷移 | `@startuml` (state) | State transition table / 状態遷移表 | N-switch coverage / Nスイッチカバレッジ |
| Classification Tree / 分類ツリー | `@startmindmap` | Factor/level table / 因子・水準表 | Combinatorial tests / 組合せテスト |
| Class Diagram / クラス図 | `@startuml` (class) | Responsibility matrix / 責務マトリクス | — |
| Sequence Diagram / シーケンス図 | `@startuml` (sequence) | Message trace table / メッセージトレース表 | — |
| Activity Diagram / アクティビティ図 | `@startuml` (activity) | Decision table / デシジョンテーブル | Path coverage / パスカバレッジ |

## 7. System Requirements / システム要求

> Writing style: Verb + Object / 記述スタイル: 動詞＋目的語
> Data source: [`system_requirements.yaml`](./system_requirements.yaml)

### Phase 1 (MVP) — Core Review Platform / コアレビュー基盤

| ID | Title | Function | Traces to |
|---|---|---|---|
| FR-1.1 | Render PlantUML editor with syntax highlighting | `PlantUmlEditor` | UR-1.1 |
| FR-1.2 | Encode PlantUML source for server request | `encodePlantUml` | UR-1.2 |
| FR-1.3 | Fetch SVG from PlantUML Server | `PlantUmlService.renderSvg` | UR-1.2 |
| FR-1.4 | Display SVG preview with pan and zoom | `SvgPreview` | UR-1.2 |
| FR-1.5 | Send chat message to AI via n8n | `N8nService.chat` | UR-1.3 |
| FR-1.6 | Render chat message list | `MessageList` | UR-1.3, UR-1.5 |
| FR-1.7 | Extract PlantUML source from AI response | n8n workflow | UR-1.4 |
| FR-1.8 | Display source diff for AI proposals | `SourceDiffView` | UR-1.4 |
| FR-1.9 | Apply proposed source modification | `SessionStore.applyProposal` | UR-1.4 |
| FR-1.10 | Undo source modification | `SessionStore.undoSource` | UR-1.4 |
| FR-1.11 | Export session as JSON | `ExportService.exportAsJson` | UR-1.6 |
| FR-1.12 | Check PlantUML Server health | `PlantUmlService.checkHealth` | UR-1.2 |
| FR-1.12b | Check n8n connectivity | `N8nService.checkHealth` | UR-1.3 |
| FR-1.13 | Manage session state | `SessionStore` | UR-1.1, UR-1.3, UR-1.5 |
| FR-1.14 | Render resizable analysis panel with tabs | `AnalysisPanel` | UR-1.1, UR-1.7 |
| FR-1.15 | Render diagram as primary view | `DiagramView` | UR-1.2 |

### Phase 2 (Analytical Review) — Model Analysis + Interactive / モデル解析＋インタラクティブ

| ID | Title | Function | Traces to |
|---|---|---|---|
| FR-2.1 | Generate analysis table from PlantUML source | `TableGenerator` | UR-2.1 |
| FR-2.2 | Generate test cases from model | `TestCaseGenerator` | UR-2.2 |
| FR-2.3 | Display EBNF-constrained grammar | `EbnfView` | UR-2.3 |
| FR-2.4 | Highlight diagram-table correspondence bidirectionally | `BidirectionalHighlighter` | UR-2.4 |
| FR-2.5 | Detect model type from PlantUML source | `ModelTypeDetector` | UR-2.5 |
| FR-2.6 | Render model diagram as React Flow nodes | `ReactFlowCanvas` | UR-2.6 |
| FR-2.7 | Attach review comment to element | `CommentStore.addComment` | UR-2.7 |

### Phase 3 (Enterprise) — Collaborative + Enterprise / コラボレーション＋エンタープライズ

| ID | Title | Function | Traces to |
|---|---|---|---|
| FR-3.1 | Commit review evidence to GitHub via n8n | `N8nService.commitReviewEvidence` | UR-3.2 |
| FR-3.2 | Integrate review lifecycle with n8n workflows | `N8nService.notifyEvent` | UR-3.3 |
| FR-3.3 | Collect feedback from chat apps via n8n | `N8nService.collectFeedback` | UR-3.1 |

## 8. Non-Functional Requirements / 非機能要求

| ID | Category / カテゴリ | Key Requirements / 主要要件 |
|---|---|---|
| NFR-1 | Performance / パフォーマンス | SVG preview < 2s, AI first token < 5s (streaming), UI < 100ms |
| NFR-2 | Security / セキュリティ | No secrets in frontend, all API calls via n8n, OWASP Top 10, input sanitization |
| NFR-3 | Usability / ユーザビリティ | Responsive (desktop-first), dark mode, keyboard shortcuts, i18n (EN/JA) |
| NFR-4 | Availability / 可用性 | Static SPA hosting, PlantUML/n8n health check, offline notification, self-hosted (Docker Compose) |
| NFR-5 | Extensibility / 拡張性 | All PlantUML diagram types, future Mermaid support, plugin architecture |

## 9. Data Model / データモデル

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

## 10. External Interfaces / 外部インターフェース

### 10.1 PlantUML Server API

- **Endpoint**: `http://localhost:8080/svg/{encoded}` (Docker local)
- **Method**: GET
- **Input**: PlantUML source encoded with Deflate + Base64
- **Output**: SVG image

### 10.2 n8n Webhook (Chat Relay)

- **Endpoint**: `{n8n_base_url}/webhook/modellogue-chat`
- **Method**: POST
- **Input**: Current PlantUML source + conversation history + user message
- **Output**: AI text response (streaming via SSE)
- **Note**: n8n internally calls Gemini 2.5 Flash API with API key managed on n8n side

## 11. Constraints / 制約事項

- No data persistence in the tool itself (Volatile Canvas philosophy) / 本ツール自体はデータの永続化を行わない
- Session data lives only in browser memory / セッションデータはブラウザのメモリ上にのみ保持
- Export (Phase 1) or GitHub (Phase 3) for persistence / 永続化にはエクスポートまたはGitHub連携を使用
- Network connectivity to PlantUML Server and n8n is required / PlantUML Serverとn8nへのネットワーク接続が必須

## 12. Glossary / 用語集

| Term / 用語 | Definition / 定義 |
|---|---|
| Volatile Canvas | Temporary thinking canvas. Diagrams exist only during the session / 一時的な思考のキャンバス。セッション中のみ存在 |
| Review Evidence / レビュー証跡 | Set of model source + full dialogue log. Records the decision-making process / モデルソース＋全対話ログのセット |
| Review Hub | ModelLogue frontend UI / ModelLogueのフロントエンドUI |
| Analysis Panel / 解析パネル | Bottom pull-up panel with tabs for source, table, test cases, EBNF / 下からスライドアップするタブ付きパネル |
| Pointing Review / ポインティング・レビュー | Review method by pointing at diagram elements / 図の要素を指差しして行うレビュー方式 |
| Bidirectional Highlighting / 双方向ハイライト | Click diagram element → highlight table row, and vice versa / 図の要素クリック→表の行ハイライト、その逆も |
| N-switch Coverage / Nスイッチカバレッジ | Test technique covering state transition sequences of length N / 長さNの状態遷移シーケンスをカバーするテスト技法 |
