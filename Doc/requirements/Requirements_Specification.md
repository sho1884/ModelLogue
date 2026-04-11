# ModelLogue Requirements Specification / ModelLogue 要求仕様書

| Item / 項目 | Content / 内容 |
|------|---------|
| Document / 文書 | ModelLogue Requirements Specification / ModelLogue 要求仕様書 |
| Version / バージョン | 6.0 (Draft / ドラフト) |
| Created / 作成日 | 2026-04-08 |
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
| UR-009 | Receive an initial model into the review session / レビューセッションに初版モデルを受け取る | High / 高 |
| UR-010 | Close the review session with an outcome / 結末を付けてレビューセッションを終了する | Medium / 中 |
| UR-011 | Convert between state machine source and state transition table / 状態マシンソースと状態遷移表を相互変換する | Medium / 中 |

> **Note 1**: UR-009とUR-010の前後（初版生成手段、終了後フィードバック先）はn8nワークフローで現場ごとに構成する。ModelLogue本体は入出力の境界に専念する。詳細は [ADR-008](../adr/ADR-008-scope-boundary-with-surrounding-workflow.yaml) を参照。
>
> **Note 2**: UR-011の変換器は、ModelLogue本体ではなく、同一リポジトリ内の補助サービスとして実装する。CI/CDパイプラインからも直接呼び出せる。詳細は [ADR-010](../adr/ADR-010-external-services-for-heavy-or-domain-specific-work.yaml) と [ADR-011](../adr/ADR-011-strict-formats-and-deterministic-conversion.yaml) を参照。

---

## 3. System Requirements / システム要件

> Source / 出典: [system_requirements.yaml](./system_requirements.yaml)

### 3.1 Source Editing / ソース編集

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-001 | Render PlantUML editor with syntax highlighting / 構文ハイライト付きエディタを表示する | UR-002, UR-009 |
| SR-002 | Parse PlantUML subset into state machine model / PlantUMLサブセットを状態マシンモデルに解析する | UR-001, UR-002, UR-003, UR-009 |
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
| `state X { ... }` | Composite state (one level only) / 複合状態（1階層限定） | `state ReviewLoop { [*] --> Inspecting Inspecting --> Asking : ask }` |
| `X --> Y : event` where X is a composite | Group escape transition / グループ脱出遷移 | `ReviewLoop --> Done : finished` |
| `Y --> X` where X is a composite | Entry to composite's internal default / 複合状態の内部初期状態への進入 | `[*] --> ReviewLoop` |

**Not supported / 非対応** (rejected as syntax errors per ADR-009 / ADR-009により構文エラーで拒否):
- Styling, colors, notes / スタイル、色、ノート
- Nested composite states (composite inside composite) / 複合状態の入れ子（多階層）
- Orthogonal regions (`--` separator inside composite) / 直交領域（並行状態）
- History pseudo-states (`[H]`, `[H*]`) / ヒストリ擬似状態
- Dot-notation entry to a specific child (`X.Y`) / ドット記法による直接進入
- Entry/exit point pseudo-states / entry/exit point擬似状態

> **複合状態の制限について**: ModelLogueは PlantUML の完全互換ではなく、レビュー目的に絞った最小サブセットをサポートする。1階層の複合状態だけをサポートすることで、設計のDRY化と状態遷移表のレイヤード戦略を実現しつつ、実装コストを抑えている。詳細は [ADR-009](../adr/ADR-009-composite-states-minimal-subset.yaml) を参照。

**Rule Scenarios / ルールシナリオ** (SR-002):

| # | 状況 | 操作 | 結果 |
|---|------|------|------|
| 1 | ソースに構文エラーがある | ユーザーがソースを編集する | 行番号付きエラーメッセージを表示し、最後の有効なモデルを保持する |
| 2 | ソースが有効である | ユーザーがソースを編集する | 500msデバウンス後にモデルを更新する |
| 3 | ソースに入れ子の入れ子（複合状態の中に複合状態）がある | パーサーが2階層目の複合状態に到達する | 構文エラーを報告する。サポート対象外（ADR-009） |
| 4 | ソースに直交領域（複合状態内の `--` 区切り）がある | パーサーが区切りに到達する | 構文エラーを報告する。サポート対象外（ADR-009） |
| 5 | ソースにヒストリ擬似状態（`[H]` 等）がある | パーサーがヒストリマーカーに到達する | 構文エラーを報告する。サポート対象外（ADR-009） |
| 6 | ソースにドット記法による進入（`X.Y`）がある | パーサーがドット記法に到達する | 構文エラーを報告する。サポート対象外（ADR-009） |

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
| SR-020 | Generate State×Event matrix in hybrid form / 状態×イベントマトリクスをハイブリッド形式で生成する | UR-003 |
| SR-021 | Generate PreState×PostState matrix in hybrid form / 遷移前×遷移後マトリクスをハイブリッド形式で生成する | UR-003 |
| SR-022 | Provide marker context to AI / マーカー情報をAIコンテキストに渡す | UR-004, UR-005 |

#### ハイブリッドパターン (Hybrid Pattern)

ModelLogueの状態遷移表は、業界調査（ISO/IEC/IEEE 29119-4、MATLAB Stateflow、IBM Rhapsodyなど）に基づくハイブリッドパターンを採用する。複合状態と子状態の両方を行に含め、子状態は親複合状態の下にインデント表示する。複合状態の行にはグループ脱出遷移（複合状態を source とする遷移）を、子状態の行には個別の遷移を記述する。これにより設計のDRY化を表現上も実現できる。

**State×Event Matrix / 状態×イベントマトリクス** (SR-020、ハイブリッド表示の例):

|  | start | stop | fault | reset |
|--|-------|------|-------|-------|
| **Operating** （複合状態）| | | Failure | |
| 　Idle（子状態）| Working | | | |
| 　Working（子状態）| | Idle | | |
| Failure | | | | Operating |

- 複合状態 `Operating` の行には、「内部のどの状態からでも `fault` で `Failure` に脱出する」というグループ脱出遷移が入る
- 子状態 `Idle` / `Working` の行には、それぞれ固有の遷移が入る
- 子状態は親の下にインデント表示

複合状態がない図では、従来通りフラットな表として表示される。

**PreState×PostState Matrix / 遷移前×遷移後マトリクス** (SR-021、ハイブリッド表示の例):

|  | Operating | Idle | Working | Failure |
|--|-----------|------|---------|---------|
| **Operating** | | | | fault |
| 　Idle | | | start | |
| 　Working | | stop | | |
| Failure | reset | | | |

- 行・列ともにハイブリッド構成
- 複合状態への進入は複合状態の列に表示される

**Rule Scenarios / ルールシナリオ** (SR-020):

| # | 状況 | 操作 | 結果 |
|---|------|------|------|
| 1 | 遷移にガード条件がある | マトリクスを生成する | セルにガード注釈付きで遷移先状態を表示する |
| 2 | 同一状態・同一イベントで複数遷移がある（ガードが異なる） | マトリクスを生成する | セルにすべての遷移先をガードとともに表示する |
| 3 | 複合状態にグループ脱出遷移がある | マトリクスを生成する | 複合状態の行に遷移を表示し、子状態の行には複製しない |
| 4 | モデルに複合状態がない | マトリクスを生成する | 従来通りフラットな表として表示する |

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
| SR-040 | Manage session state in browser memory / ブラウザメモリでセッション状態を管理する | UR-002, UR-005, UR-007, UR-010 |
| SR-041 | Export session as JSON / セッションをJSONとしてエクスポートする | UR-007, UR-010 |

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
  type: 'normal' | 'composite' | 'initial' | 'final';
  parentId: string | null;  // id of the enclosing composite, or null for top-level
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
  outcome: SessionOutcome | null;  // set when the session is closed
}

interface SessionOutcome {
  status: 'consensus' | 'postponed' | 'spec_issue';
  closedAt: string;    // ISO 8601
  note: string | null;
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

### 8.1 補助サービスとして実装する拡張

[ADR-010](../adr/ADR-010-external-services-for-heavy-or-domain-specific-work.yaml) に基づき、ModelLogue本体ではなく、同一リポジトリ内の独立したCLI＋APIサービスとして実装する。CI/CDパイプラインからも呼び出せる。

| Extension / 拡張 | Description / 説明 | 関連UR/ADR |
|---|---|---|
| N-switch coverage generator / Nスイッチカバレッジ生成器 | PlantUMLソース → テストケースCSV。複合状態にはレイヤード戦略を適用 | UR-003 (将来), ADR-009, ADR-010 |
| State-table converter / 状態遷移表変換器 | PlantUMLソース ↔ 状態遷移表CSVの双方向変換。決定論的、CSV形式は厳密定義 | UR-011, ADR-010, ADR-011 |

### 8.2 その他の拡張（位置づけ未定）

| Extension / 拡張 | Description / 説明 |
|---|---|
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
| Composite State / 複合状態 | A state that contains child states. Used to factor out common behavior of a group of states. ModelLogue supports one level only (ADR-009). / 子状態を内包する状態。複数状態の共通動作を集約する。ModelLogueは1階層のみサポート |
| Group Escape Transition / グループ脱出遷移 | A transition whose source is a composite state, meaning "from any child state" / 複合状態を遷移元とする遷移。「内部のどの子状態からでも」という意味 |
| Hybrid Pattern / ハイブリッドパターン | State transition table layout where both composite states and child states appear as rows, with children indented under their parent (industry standard per ISO/IEC/IEEE 29119-4) / 複合状態と子状態の両方を行に含め、子状態を親の下にインデント表示する状態遷移表のレイアウト |
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
