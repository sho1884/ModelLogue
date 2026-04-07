# ModelLogue Requirements Specification / ModelLogue 要求仕様書

| Item / 項目 | Content / 内容 |
|------|---------|
| Document / 文書 | ModelLogue Requirements Specification / ModelLogue 要求仕様書 |
| Version / バージョン | 5.0 (Draft / ドラフト) |
| Created / 作成日 | 2026-04-07 |
| Status / 状態 | Under Review / レビュー中 |

---

## 1. Purpose / 目的

This document defines requirements for ModelLogue, a model review platform for software development.

本文書は ModelLogue（ソフトウェア開発におけるモデルレビュー支援プラットフォーム）の要件を定義する。

**Current scope / 現在のスコープ**: State machine diagram review / 状態遷移図のレビュー

### 1.1 Documentation Structure / ドキュメント構成

| Type / 種別 | Location / 場所 | Purpose / 目的 |
|------|----------|---------|
| Data (YAML) / データ | [requirements/](.) | Machine-readable, single source of truth / 機械可読、唯一の真実源 |
| View (Markdown) / ビュー | This document / 本文書 | Human-readable summary / 可読性の高い要約 |
| Traceability / トレーサビリティ | [Traceability.md](../Traceability.md) | Hierarchy diagrams with Mermaid / Mermaid による系統図 |

### 1.2 Writing Conventions / 記述規約

| Level / レベル | Format / 形式 | Example / 例 |
|-------|--------|---------|
| User Requirement / ユーザー要件 | Task expression / タスク表現 | "Review the diagram" / "図をレビューする" |
| System Requirement / システム要件 | Verb + Object / 動詞＋目的語 | "Parse PlantUML source" / "PlantUMLソースを解析する" |
| Rule Scenario / ルールシナリオ | Context → Action → Outcome | See below / 下記参照 |

**Rule Scenario Structure / ルールシナリオ構造**:
```
状況:  ～の場合
操作:  ユーザーが～を行う
結果:  システムが～を返す
```

### 1.3 Core Concepts / コア・コンセプト

- **Volatile Canvas**: Model diagrams are temporary thinking canvases, not final deliverables / モデル図は一時的な思考のキャンバスであり最終成果物ではない
- **Dialogue as Asset**: Human-AI dialogue logs are treated as the essential design asset / 人間とAIの対話ログを設計の本質的な資産として扱う
- **Lean Architecture**: Orchestrate external services, don't own functionality / 機能を抱え込まず外部サービスをオーケストレーションする
- **Meaning from Source**: Diagram meaning comes from PlantUML source, not SVG / 図の意味はSVGではなくPlantUMLソースから得る
- **Marker-based Pointing**: Reviewers place colored markers (ellipse, rectangle, arrow) on top of the diagram to indicate "look here" during a review. Markers are not bound to a specific element; the AI uses the marker geometry plus the model element coordinates to figure out what is being pointed at. / レビューアは図の上に色付きマーカー（楕円・矩形・矢印）を置いて「ここに注目」を示す。マーカーは特定要素に縛られず、AIがマーカーの座標とモデル要素の座標から指示対象を推測する |

---

## 2. User Requirements / ユーザー要件

> Source / 出典: [user_requirements.yaml](./user_requirements.yaml)

| ID | Task / タスク | Priority / 優先度 |
|----|------|----------|
| UR-001 | Review state machine diagram / 状態遷移図をレビューする | High / 高 |
| UR-002 | Edit PlantUML source / PlantUMLソースを編集する | High / 高 |
| UR-003 | View state transition table / 状態遷移表を見る | High / 高 |
| UR-004 | Place markers on the diagram / 図にマーカーを配置する | High / 高 |
| UR-005 | Discuss the model with AI / AIとモデルについて対話する | High / 高 |
| UR-006 | Apply AI suggestions / AIの提案を適用する | Medium / 中 |
| UR-007 | Export review session / レビューセッションをエクスポートする | Medium / 中 |
| UR-008 | View PlantUML subset grammar / PlantUMLサブセット文法を見る | Low / 低 |

---

## 3. System Requirements / システム要件

> Source / 出典: [system_requirements.yaml](./system_requirements.yaml)

### 3.1 Source Editing / ソース編集

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-001 | Render PlantUML editor with syntax highlighting / 構文ハイライト付きエディタを表示する | UR-002 |
| SR-002 | Parse PlantUML subset into state machine model / PlantUMLサブセットを状態マシンモデルに解析する | UR-001, UR-002, UR-003 |
| SR-003 | Serialize state machine model to PlantUML source / 状態マシンモデルをPlantUMLソースに変換する | UR-006 |

**PlantUML Subset Grammar / PlantUMLサブセット文法** (SR-002):

| Syntax / 構文 | Meaning / 意味 | Example / 例 |
|------|---------|---------|
| `[*] --> S` | Initial transition / 初期遷移 | `[*] --> Idle` |
| `S --> [*]` | Final transition / 終了遷移 | `Done --> [*]` |
| `S1 --> S2 : event` | Transition with event / イベント付き遷移 | `Idle --> Active : start` |
| `S1 --> S2 : event [guard]` | Transition with guard / ガード付き遷移 | `Idle --> Processing : submit [valid]` |
| `S1 --> S2 : event [guard] / action` | Full transition / 完全な遷移 | `Idle --> Processing : submit [valid] / validate()` |
| `state "name" as alias` | State alias / 状態の別名 | `state "待機中" as Idle` |

**Not supported / 非対応** (review-focused simplification / レビュー目的の簡素化):
- Styling, colors, notes / スタイル、色、ノート
- Concurrency (`--`), history states / 並行状態、履歴状態
- Composite states (future extension) / 複合状態（将来拡張）

**Rule Scenarios / ルールシナリオ** (SR-002):

| # | 状況 | 操作 | 結果 |
|---|------|------|------|
| 1 | ソースに構文エラーがある | ユーザーがソースを編集する | 行番号付きエラーメッセージを表示し、最後の有効なモデルを保持する |
| 2 | ソースが有効である | ユーザーがソースを編集する | 500msデバウンス後にモデルを更新する |

### 3.2 Diagram Display / 図の表示

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-010 | Display PlantUML SVG with pan and zoom / PlantUML SVGをパン・ズーム付きで表示する | UR-001 |
| SR-011 | Extract element coordinates from PlantUML SVG / PlantUML SVGから要素座標を抽出する | UR-001, UR-004 |
| SR-012 | Provide marker tool selection / マーカーツールを選択する | UR-004 |
| SR-013 | Draw marker by drag / ドラッグでマーカーを描画する | UR-004 |
| SR-014 | Manage marker colors from a fixed palette / 固定パレットでマーカー色を管理する | UR-004 |
| SR-015 | Select, move, and resize markers / マーカーを選択・移動・リサイズする | UR-004 |
| SR-016 | Delete marker / マーカーを削除する | UR-004 |
| SR-017 | Render marker overlay over the SVG / マーカーをSVG上のレイヤーに描画する | UR-004 |

**Architecture / アーキテクチャ**: PlantUML SVG is displayed directly with pan and zoom. A small marker overlay layer (native SVG, no third-party whiteboard framework) sits on top. Reviewers select a marker tool (ellipse, rectangle, or arrow) and drag to draw a marker. Markers are not bound to specific model elements; instead, the AI receives both the marker geometry and the model element coordinates, and reasons about which elements are being indicated.

PlantUML SVGをパン・ズーム付きで直接表示する。その上に小さなマーカー描画レイヤー（ネイティブSVG、外部ホワイトボードフレームワーク不使用）を重ねる。レビューアはマーカーツール（楕円・矩形・矢印）を選び、ドラッグして描く。マーカーは特定のモデル要素に縛られず、AIにマーカー座標とモデル要素座標の両方が渡され、AIがどの要素を指しているか推測する。

```
PlantUML Source ──parse──→ StateMachineModel（意味）
PlantUML Source ──encode──→ PlantUML Server ──→ SVG（表示 + 座標抽出）
SVG ──extract──→ Coordinate Map
User drag on overlay → MarkerStore (id + type + color + geometry)
MarkerStore + Coordinate Map → AI chat context
```

### 3.3 State Transition Table / 状態遷移表

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-020 | Generate State×Event matrix / 状態×イベントマトリクスを生成する | UR-003 |
| SR-021 | Generate PreState×PostState matrix / 遷移前状態×遷移後状態マトリクスを生成する | UR-003 |
| SR-022 | Provide marker context to AI / マーカー情報をAIコンテキストに渡す | UR-004, UR-005 |

**State×Event Matrix / 状態×イベントマトリクス** (SR-020):

|  | Event1 | Event2 | Event3 |
|--|--------|--------|--------|
| State0 | State1 | | |
| State1 | | State2 | |
| State2 | | | State0 |

- Rows: states / 行：状態
- Columns: events / 列：イベント
- Cell: next state (empty = no transition) / セル：遷移先状態（空 = 遷移なし）

**PreState×PostState Matrix / 遷移前×遷移後マトリクス** (SR-021):

|  | State0 | State1 | State2 |
|--|--------|--------|--------|
| State0 | | Event1 | |
| State1 | | | Event2 |
| State2 | Event3 | | |

- Rows: source states / 行：遷移元状態
- Columns: target states / 列：遷移先状態
- Cell: event name (empty = no direct transition) / セル：イベント名（空 = 直接遷移なし）

**Rule Scenarios / ルールシナリオ** (SR-020):

| # | 状況 | 操作 | 結果 |
|---|------|------|------|
| 1 | 遷移にガード条件がある | マトリクスを生成する | セルにガード注釈付きで遷移先状態を表示する |
| 2 | 同一状態・同一イベントで複数遷移がある（ガードが異なる） | マトリクスを生成する | セルにすべての遷移先をガードとともに表示する |

### 3.4 AI Chat / AI対話

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-030 | Send chat message to AI via n8n / n8n経由でAIにメッセージを送信する | UR-005 |
| SR-031 | Render chat message list / チャットメッセージ一覧を表示する | UR-005 |
| SR-032 | Extract PlantUML source from AI response / AIの応答からPlantUMLソースを抽出する | UR-006 |
| SR-033 | Display source diff for AI proposals / AI提案のソース差分を表示する | UR-006 |
| SR-034 | Apply proposed source modification / 提案されたソース修正を適用する | UR-006 |
| SR-035 | Undo source modification / ソース修正を元に戻す | UR-006 |

### 3.5 Session Management / セッション管理

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-040 | Manage session state in browser memory / ブラウザメモリでセッション状態を管理する | UR-002, UR-005, UR-007 |
| SR-041 | Export session as JSON / セッションをJSONとしてエクスポートする | UR-007 |

### 3.6 Grammar Display / 文法表示

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-050 | Display PlantUML subset grammar / PlantUMLサブセット文法を表示する | UR-008 |

### 3.7 Infrastructure / インフラ

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-060 | Check PlantUML Server health / PlantUML Serverの稼働状態を確認する | UR-001 |
| SR-061 | Check n8n connectivity / n8nの接続状態を確認する | UR-005 |

### 3.8 UI Layout / UI構成

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-070 | Render state machine diagram as primary view / 状態マシン図をプライマリビューとして表示する | UR-001 |
| SR-071 | Render resizable analysis panel with tabs / リサイズ可能なタブ付き解析パネルを表示する | UR-002, UR-003, UR-008 |
| SR-072 | Render chat panel / チャットパネルを表示する | UR-005, UR-006 |

**Screen Layout / 画面構成**:

```
┌──────────────────────────────────┬──────────────┐
│  Diagram View                    │  Chat/Review  │
│  PlantUML SVG + marker overlay   │  Panel        │
│  [⬭ ▭ ⇢]   ← marker tool buttons │  チャット      │
├── drag to resize ────────────────┤              │
│  ▲ Analysis Panel [tabs]        │              │
│  [Source|State×Event|State×State|EBNF]          │
│  解析パネル                       │              │
├──────────────────────────────────┴──────────────┤
│  Status Bar / ステータスバー                      │
└──────────────────────────────────────────────────┘
```

---

## 4. Non-Functional Requirements / 非機能要件

> Source / 出典: [nonfunctional_requirements.yaml](./nonfunctional_requirements.yaml)

| ID | Category / カテゴリ | Key Criteria / 主要基準 |
|---|---|---|
| NFR-001 | Performance / パフォーマンス | Parse < 100ms, SVG extraction < 2s, Table < 100ms, AI first token < 5s |
| NFR-010 | Usability / ユーザビリティ | Mouse-driven pan/zoom/select, drag-resize panels |
| NFR-011 | Error handling / エラー処理 | Line-number errors, status bar notifications, last valid state retained |
| NFR-020 | Compatibility / 互換性 | Chrome (primary), Firefox/Safari/Edge (secondary) |
| NFR-030 | Security / セキュリティ | No secrets in frontend, OWASP Top 10, input validation through parser |
| NFR-040 | i18n / 国際化 | EN/JA bilingual, browser locale default |
| NFR-050 | Maintainability / 保守性 | TypeScript strict, modular (parser, model, diagram, table) |
| NFR-060 | Availability / 可用性 | Static SPA, Docker Compose (PlantUML + n8n) |
| NFR-070 | Licensing / ライセンス | MIT project, permissive deps only (no GPL/LGPL/AGPL) |

---

## 5. Data Model / データモデル

```typescript
interface StateMachineModel {
  states: State[];
  transitions: Transition[];
  events: string[];    // deduplicated
}

interface State {
  id: string;          // PlantUML name or alias
  label: string;       // display name
  type: 'normal' | 'initial' | 'final';
}

interface Transition {
  sourceStateId: string;
  targetStateId: string;
  event: string | null;
  guard: string | null;
  action: string | null;
}

interface ReviewSession {
  id: string;
  name: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  plantUmlSource: string;
  messages: ChatMessage[];
  sourceHistory: SourceSnapshot[];
  markers: Marker[];
}

type MarkerColor = 'red' | 'blue' | 'green' | 'purple';

interface Marker {
  id: string;
  type: 'ellipse' | 'rectangle' | 'arrow';
  color: MarkerColor;
  geometry: EllipseGeometry | RectangleGeometry | ArrowGeometry;
}

interface EllipseGeometry { cx: number; cy: number; rx: number; ry: number; }
interface RectangleGeometry { x: number; y: number; width: number; height: number; }
interface ArrowGeometry { x1: number; y1: number; x2: number; y2: number; }
```

Marker geometry is in the SVG coordinate space (the space of the PlantUML SVG). Markers are stored alongside the session and are part of the AI chat context.

マーカーの座標はPlantUML SVGのSVG座標空間で保持する。マーカーはセッションの一部として保管され、AIチャットのコンテキストに含まれる。

---

## 6. External Interfaces / 外部インターフェース

### 6.1 PlantUML Server API

| Item / 項目 | Specification / 仕様 |
|---|---|
| Endpoint | `http://localhost:8080/svg/{encoded}` |
| Method | GET |
| Input | PlantUML source (Deflate + Base64) |
| Output | SVG image (displayed directly + parsed for coordinate extraction) |

### 6.2 n8n Webhook (Chat Relay)

| Item / 項目 | Specification / 仕様 |
|---|---|
| Endpoint | `{n8n_base_url}/webhook/modellogue-chat` |
| Method | POST |
| Input | PlantUML source + conversation history + user message |
| Output | AI response (streaming via SSE) |
| Note | n8n calls Gemini API; API key managed on n8n side |

---

## 7. Constraints / 制約事項

- Session data is volatile (browser memory only) / セッションデータはブラウザメモリにのみ保持（Volatile Canvas）
- Export (JSON) for persistence / 永続化にはエクスポートを使用
- Network connectivity to PlantUML Server and n8n is required / PlantUML Serverとn8nへの接続が必須

---

## 8. Future Extensions / 将来拡張

| Extension / 拡張 | Description / 説明 |
|---|---|
| N-switch coverage / Nスイッチカバレッジ | 0-3 switch test case generation (matrix calculation) / 0〜3スイッチのテストケース生成 |
| Activity diagram / アクティビティ図 | BPMN-style activity diagram support / BPMN風アクティビティ図対応 |
| Requirements tree / 要求系統図 | Requirements derivation tree / 要求帰納系統図 |
| Classification tree / 分類ツリー | Classification tree method / クラシフィケーションツリー法 |
| Real-time marker collaboration / マーカーのリアルタイム共有 | Multi-user marker sharing via WebSocket / WebSocket経由のマルチユーザー共有 |
| AI-initiated markers / AI起点のマーカー | AI places a marker to point at something it's discussing / AIが議論対象を指すためにマーカーを配置 |
| Chat app integration / チャットアプリ連携 | Slack/Teams/Discord feedback via n8n / n8n経由のフィードバック |
| GitHub integration / GitHub連携 | Auto-commit review evidence via n8n / n8n経由のレビュー証跡自動コミット |

---

## 9. Glossary / 用語集

| Term / 用語 | Definition / 定義 |
|---|---|
| Volatile Canvas | Temporary thinking canvas; diagrams exist only during the session / 一時的な思考のキャンバス。セッション中のみ存在 |
| Review Evidence / レビュー証跡 | Set of model source + full dialogue log / モデルソース＋全対話ログのセット |
| StateMachineModel | Canonical representation parsed from PlantUML source / PlantUMLソースから解析された正規表現 |
| State×Event Matrix / 状態×イベント表 | Table with states as rows, events as columns, cells showing next state / 行：状態、列：イベント、セル：遷移先状態 |
| PreState×PostState Matrix / 遷移前×遷移後表 | Table with source states as rows, target states as columns, cells showing event / 行：遷移元、列：遷移先、セル：イベント |
| Marker / マーカー | A colored shape (ellipse, rectangle, or arrow) drawn by the reviewer on top of the diagram to indicate "look here". Markers have an id, type, color, and geometry, and are passed to the AI as context. / レビューアが図の上に描く色付き図形（楕円・矩形・矢印）。「ここに注目」を示す。ID、タイプ、色、座標を持ち、AIにコンテキストとして渡される |
| Marker Color Palette / マーカー色パレット | Fixed four-color set (red, blue, green, purple). New markers get an unused color; if all four are in use, a new marker cannot be added. / 4色固定（赤、青、緑、紫）。新マーカーは未使用色を取り、4色すべて使用中なら追加不可 |
| N-switch Coverage / Nスイッチカバレッジ | Test technique covering state transition sequences of length N / 長さNの遷移シーケンスをカバーするテスト技法 |

---

## 10. Related Documents / 関連文書

- [Traceability / トレーサビリティ](../Traceability.md)
- [Architecture / アーキテクチャ設計](../architecture.md)
- [Security Design / セキュリティ設計](../Security_Design.md)
