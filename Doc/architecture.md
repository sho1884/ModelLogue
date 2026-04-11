# ModelLogue アーキテクチャ設計書

**バージョン**: 6.0
**作成日**: 2026-04-08
**ステータス**: ドラフト

---

## 1. アーキテクチャ概要

ModelLogueは「持たないアーキテクチャ」を基本としつつ、モデルの意味解析はフロントエンドが担う。PlantUMLソースの**意味**はフロントエンドのパーサーで抽出し、**図の表示**はPlantUML ServerのSVGをそのまま使用する。SVGの上にネイティブSVGの薄いマーカーオーバーレイを重ね、レビューアはマーカー（楕円・矩形・矢印）を置いて「ここに注目」を示す。マーカーは特定要素に縛られず、AIに「マーカーの座標」と「モデル要素の座標」の両方を渡し、AIに解釈を任せる。

### システム構成図

```
┌──────────────────────────────────────────────────────────────────┐
│                    ブラウザ（SPA）                                 │
│                                                                  │
│  ┌─────────────────────────────┐  ┌───────────────────────────┐  │
│  │  DiagramView                │  │  ChatPanel                │  │
│  │   ├ SvgPreview (PlantUML)   │  │  AI対話                    │  │
│  │   └ MarkerOverlay (native)  │  │                           │  │
│  ├─────────────────────────────┤  │                           │  │
│  │  AnalysisPanel (タブ)        │  │                           │  │
│  │  [Source|S×E|S×S|EBNF]      │  │                           │  │
│  └──────────┬──────────────────┘  └────────────┬──────────────┘  │
│             │                                  │                 │
│  ┌──────────┴──────────────────────────────────┴──────────────┐  │
│  │                    Zustand ストア                            │  │
│  └──┬────────────┬──────────────┬───────────────┬─────────────┘  │
│     │            │              │               │                │
│  ┌──┴────┐  ┌────┴─────┐  ┌────┴────┐  ┌───────┴──────────┐    │
│  │Parser │  │Coordinate│  │ Matrix  │  │ n8n              │    │
│  │       │  │Extractor │  │Generator│  │ Service          │    │
│  │PlantUML│  │SVG→座標  │  │モデル→表 │  │ (Webhook POST)   │    │
│  │→Model │  │          │  │         │  │                  │    │
│  └───────┘  └────┬─────┘  └─────────┘  └────────┬─────────┘    │
└──────────────────┼──────────────────────────────┼───────────────┘
                   │                              │
                   ▼                              ▼
           ┌──────────────┐               ┌──────────────────┐
           │ PlantUML     │               │  n8n (Docker)    │
           │ Server       │               │  ┌────────────┐  │
           │ (Docker)     │               │  │ Gemini API │  │
           │              │               │  │ (チャット)  │  │
           │ source → SVG │               │  └────────────┘  │
           └──────────────┘               └──────────────────┘

  ┌─ Future: Auxiliary Services (ADR-010, same repository) ──────┐
  │                                                              │
  │   ┌──────────────────┐    ┌──────────────────────────┐       │
  │   │ N-switch         │    │ State-table converter    │       │
  │   │ generator        │    │ (CSV ↔ PlantUML source)  │       │
  │   │ (CLI + API)      │    │ (CLI + API)              │       │
  │   └──────────────────┘    └──────────────────────────┘       │
  │                                                              │
  │   Called from ModelLogue (UI) AND from CI/CD (independent)   │
  │   Strict formats, deterministic conversions (ADR-011)        │
  └──────────────────────────────────────────────────────────────┘
```

## 2. 設計原則

### 2.1 意味はソースから、表示はSVGそのまま、マーカーはオーバーレイ

PlantUMLソースが意味の源泉。SVGはPlantUMLが生成した図をそのまま表示する（描き直さない）。マーカー（楕円・矩形・矢印）はネイティブSVGの薄いオーバーレイ層に描かれる。マーカーは特定モデル要素には縛られず、AIに「マーカーの座標」と「モデル要素の座標」を渡してAIに解釈させる。

```
PlantUML Source ──parse──→ StateMachineModel（意味）
PlantUML Source ──encode──→ PlantUML Server ──→ SVG（表示＋座標抽出）
SVG ──→ SvgPreviewにそのまま表示
SVG ──extract──→ Coordinate Map（AIコンテキスト用）
ユーザーがマーカー描画 → MarkerStore（id + type + color + geometry）
MarkerStore + Coordinate Map → AIチャットコンテキスト
```

この設計により：
- **AIなしでもモデルの意味構造は維持される**（パーサーは純粋アルゴリズム）
- **図の品質はPlantUMLのレンダリングそのまま**（エッジルーティング含む）
- **マーカーは小さなネイティブSVG実装で済む**（外部ホワイトボードフレームワーク不要）
- **マーカーをモデル要素に縛らないことで、状態遷移図以外にも同じ仕組みが流用できる**

### 2.2 持たないアーキテクチャ（選択的適用）

- 図のレイアウト → PlantUML Serverに委譲
- AI対話 → n8n + Gemini APIに委譲
- **意味解析・テーブル生成 → フロントエンドが自前で計算**
- 永続化 → エクスポート（JSON）

旧設計ではテーブル生成もLLMに委譲していたが、PlantUMLサブセットのパーサーを自前で持つことにより：
- LLM依存を排除し、確実で高速な解析が可能
- NeoCEGと同じ「テキスト→正規モデル→図＋表」パターンを踏襲

### 2.3 Volatile Canvas

- セッションデータはブラウザメモリにのみ保持
- 図は一時的な思考のキャンバスであり最終成果物ではない
- 対話ログが設計の本質的な資産
- 永続化はエクスポートで行う

### 2.4 オープンソース＋セルフホスト

- MIT License
- Docker Compose で PlantUML Server + n8n を同時起動
- APIキーはn8n側で管理

## 3. リアクティブデータフロー

### 3.1 概要

PlantUMLソースが**唯一の情報源（Single Source of Truth）**。ソース変更に応じて各ビューがリアクティブに派生する。

```
Source変更
 ├── 即時 → StateMachineParser → StateMachineModel
 │                                  ├── → StateEventMatrix → S×Eタブ
 │                                  └── → StateStateMatrix → S×Sタブ
 ├── debounce(500ms) → PlantUML Server → SVG
 │                                        ├── → SvgPreviewにそのまま表示
 │                                        └── → SvgCoordinateExtractor → 座標マップ
 ├── 静的定義 → EbnfView
 └── (独立) MarkerStore → MarkerOverlay & AIコンテキスト
```

| パイプライン | 入力 | 処理場所 | 出力 | 想定遅延 |
|------------|------|---------|------|---------|
| モデル解析 | Source | フロントエンド（Parser） | StateMachineModel | <100ms |
| 状態遷移表 | Model | フロントエンド（Matrix Generator） | マトリクスデータ | <100ms |
| SVG表示 | Source | PlantUML Server | SVG → SvgPreview | ~1s |
| 座標抽出 | SVG | フロントエンド（Extractor） | 座標マップ | <100ms |
| マーカー描画 | ユーザー操作 | MarkerOverlay | MarkerStore更新 | 即時 |
| EBNF表示 | 静的 | フロントエンド | EBNF文法テキスト | 即時 |

### 3.2 チャットフロー

```
ユーザーメッセージ + コンテキスト（Source）
  → n8n webhook → Gemini API → レスポンス
  → n8nが ```plantuml``` コードブロックを検出・抽出
  → 構造化JSON { text, suggestedSource } を返却
  → フロントエンドで差分ビュー表示 → 「適用」→ Source更新
  → Source変更 → Parser再実行 → 全パイプライン再実行
```

AIレスポンスの解析（コードブロック抽出）はn8n側で行い、フロントエンドには構造化データのみを渡す。

### 3.3 プロンプト管理

プロンプトはn8n側で管理する。フロントエンドはプロンプトの内容を知らない。

| プロンプト | 用途 | 出力形式 |
|-----------|------|---------|
| chat-system-prompt | チャット対話のシステムプロンプト | テキスト（PlantUMLコードブロック含む） |

## 4. UIレイアウト＆コンポーネント設計

### 4.1 画面構成

```
┌──────────────────────────────────────────────────────────────┐
│  Header (Logo / SessionName / ExportButton)                   │
├──────────────────────────────────────┬───────────────────────┤
│                                      │                       │
│  DiagramView（主役・最大領域）        │  ChatPanel            │
│  PlantUML SVG ＋ マーカーオーバーレイ │  （全高さ）            │
│  [⬭ ▭ ⇢] マーカーツール / パン/ズーム │  MessageList          │
│                                      │  SourceDiffView       │
├─ ─ ─ ─ ─ drag handle ─ ─ ─ ─ ─ ─ ─ ┤  ChatInput            │
│  ▲ AnalysisPanel（タブ付き）          │                       │
│  [Source | S×E | S×S | EBNF]         │                       │
│  ──────────────────────────────────  │                       │
│  (アクティブタブのコンテンツ)          │                       │
├──────────────────────────────────────┴───────────────────────┤
│  StatusBar (PlantUML Server / n8n)                            │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 コンポーネントツリー

```
App
├── Header
│   ├── Logo
│   ├── SessionName
│   └── ExportButton
├── MainLayout
│   ├── WorkArea（左側）
│   │   ├── DiagramView
│   │   │   ├── MarkerToolbar [⬭ ▭ ⇢]
│   │   │   ├── SvgPreview（PlantUML SVG + pan/zoom）
│   │   │   └── MarkerOverlay（ネイティブSVG）
│   │   └── AnalysisPanel（リサイズ可能・折りたたみ可能）
│   │       ├── TabBar [Source | S×E | S×S | EBNF]
│   │       ├── PlantUmlEditor（CodeMirror — Source tab）
│   │       ├── StateEventMatrixView（S×E tab）
│   │       ├── StateStateMatrixView（S×S tab）
│   │       └── EbnfView（EBNF tab）
│   └── ChatPanel（右側・全高さ）
│       ├── MessageList
│       │   ├── UserMessage
│       │   └── AssistantMessage
│       │       └── SourceDiffView → ApplyButton
│       └── ChatInput
└── StatusBar
    ├── PlantUmlServerStatus
    └── N8nStatus
```

## 5. ステート管理

Zustandを使用。ストアは責務ごとに分離する。

```typescript
// SessionStore — ソース＆履歴管理
interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  currentSource: string;
  sourceHistory: SourceSnapshot[];
  outcome: SessionOutcome | null;  // セッションが終了するとセットされる（UR-010）

  updateSource: (source: string, triggeredBy: string) => void;
  applyProposal: (messageId: string, source: string) => void;
  undoSource: () => void;
  setOutcome: (outcome: SessionOutcome) => void;
}

interface SessionOutcome {
  status: 'consensus' | 'postponed' | 'spec_issue';
  closedAt: string;  // ISO 8601
  note: string | null;
}

// ModelStore — パース済みモデル＆テーブル
interface ModelStore {
  model: StateMachineModel | null;
  parseError: string | null;
  stateEventMatrix: MatrixData | null;
  stateStateMatrix: MatrixData | null;

  parseSource: (source: string) => void;
}

// ChatStore — AI対話管理
interface ChatStore {
  messages: ChatMessage[];
  isStreaming: boolean;

  sendMessage: (content: string) => Promise<void>;
}

// UiStore — レイアウト＆接続状態
interface UiStore {
  analysisPanelHeight: number;
  analysisPanelCollapsed: boolean;
  activeAnalysisTab: 'source' | 'state-event' | 'state-state' | 'ebnf';
  chatPanelWidth: number;

  plantUmlStatus: 'connected' | 'disconnected' | 'checking';
  n8nStatus: 'connected' | 'disconnected' | 'checking';
}

// MarkerStore — マーカー管理
type MarkerColor = 'red' | 'blue' | 'green' | 'purple';
type MarkerType = 'ellipse' | 'rectangle' | 'arrow';

interface Marker {
  id: string;            // 安定ID（将来の協調編集・AI操作用）
  type: MarkerType;
  color: MarkerColor;    // 4色の中からの未使用色
  geometry: EllipseGeometry | RectangleGeometry | ArrowGeometry;
}

interface MarkerStore {
  markers: Marker[];
  activeTool: MarkerType;            // ツールバーで選択中
  setActiveTool: (t: MarkerType) => void;
  addMarker: (m: Omit<Marker, 'id' | 'color'>) => Marker | null; // 色満杯ならnull
  updateMarker: (id: string, geometry: Marker['geometry']) => void;
  deleteMarker: (id: string) => void;
}
```

### ModelStoreのリアクティブ更新

```
SessionStore.currentSource が変更
  → ModelStore.parseSource(source) が呼ばれる
  → StateMachineParser が Model を生成
  → StateEventMatrix, StateStateMatrix が再計算
  → テーブルビュー が再描画（SVGはPlantUML Server経由で別途更新）
```

## 6. コアモジュール設計

### 6.1 StateMachineParser

```typescript
interface StateMachineParser {
  parse(source: string): ParseResult;
}

interface ParseResult {
  model: StateMachineModel | null;
  errors: ParseError[];
}

interface ParseError {
  line: number;
  message: string;
}
```

- PlantUMLの状態遷移図サブセットのみを対象
- 純粋関数（副作用なし）
- 対応構文:
  - `[*] -->` 初期遷移、`--> [*]` 終了遷移
  - `A --> B : event [guard] / action` イベント・ガード・アクション付き遷移
  - `state "name" as alias` 状態の別名
  - `state X { ... }` 1階層限定の複合状態（ADR-009）

**複合状態のパース実装方針**:
- 行ベース解析を維持しつつ、`state X {` の出現で「現在の親ID」をセットし、`}` でクリアする
- 中括弧の深さを内部カウンタで管理し、深さ2以上は構文エラー
- 複合状態の中で生成された子状態は `parentId` に親複合状態のIDをセット
- 複合状態の名前が遷移の source となる場合は、グループ脱出遷移として扱う
- 複合状態の中の `[*] --> ChildState` は内部初期遷移として扱う（その複合状態専用の初期擬似状態を作って区別する）
- 拒否すべき構文（直交領域 `--`、ヒストリ `[H]`、ドット記法 `X.Y`、entry/exit point）を検出して構文エラーを返す

実装規模の見積もり：行ベースパーサーへの追加 30〜50 行程度。全面書き直しは不要。

### 6.2 SvgCoordinateExtractor

```typescript
interface SvgCoordinateExtractor {
  extract(svgString: string, model: StateMachineModel): CoordinateMap;
}

type CoordinateMap = Map<string, { x: number; y: number; width: number; height: number }>;
```

- PlantUML Serverが生成したSVGを解析
- SVG内のテキスト要素から状態名を特定し、囲み図形の座標を取得
- StateMachineModelの状態IDと照合してマッピング

### 6.3 MatrixGenerator

```typescript
interface MatrixGenerator {
  generateStateEventMatrix(model: StateMachineModel): MatrixData;
  generateStateStateMatrix(model: StateMachineModel): MatrixData;
}

interface MatrixData {
  rows: MatrixRow[];        // ハイブリッド構成の行（複合状態と子状態が混在）
  columnHeaders: string[];  // イベント名 or 状態名
  cells: (string | null)[][]; // [rowIndex][colIndex] のセル値
}

interface MatrixRow {
  stateId: string;
  label: string;
  level: number;            // 0 = top-level, 1 = child of a composite
  isComposite: boolean;     // true なら複合状態の行
}
```

- StateMachineModelから純粋に算出（副作用なし、即時計算）
- **ハイブリッドパターン**：複合状態と子状態の両方を行に含める。子状態は `level: 1` でインデント表示
- **複合状態の行**：その複合状態を source とするグループ脱出遷移を保持
- **子状態の行**：その子状態を source とする内部遷移を保持
- 複合状態がない場合は従来通りフラットな表（`level` がすべて 0）
- 詳細は ADR-009 と Requirements_Specification.md §3.3 を参照

MatrixView 側では `level` に応じて `padding-left` を当て、`isComposite` に応じて行の見た目を強調する。折りたたみ機能は将来拡張。

### 6.4 MarkerOverlay コンポーネント

```typescript
interface MarkerOverlayProps {
  // SVG座標空間の幅・高さ（PlantUML SVGに合わせる）
  svgWidth: number;
  svgHeight: number;
  // 現在のパン・ズーム状態（SvgPreviewと共有）
  viewport: { x: number; y: number; scale: number };
}
```

責務：
- ネイティブSVG (`<svg>` の上に重ねた透明な `<svg>`) でマーカーを描画
- ポインタイベントを受け取り、`MarkerStore.activeTool` に応じてドラッグで新規マーカーを作成
- 既存マーカーの選択・移動・リサイズ・矢印端点の調整
- 選択中マーカーで Delete/Backspace キーを処理
- マーカーは SVG 座標空間に保存されるので、パン・ズームを変えても自動的に追従する

外部ホワイトボードフレームワークは使わず、200行程度の自前実装で十分。

### 6.5 PlantUML Service

```typescript
interface PlantUmlService {
  fetchSvg(source: string): Promise<string>;
  checkHealth(): Promise<boolean>;
}
```

- PlantUMLソースを Deflate + Base64 エンコード → HTTP GET
- plantuml-encoder ライブラリを使用
- 取得したSVGはSvgCoordinateExtractorに渡す（直接表示には使わない）
- デバウンス: 500ms

### 6.6 n8n Service

```typescript
interface ChatResponse {
  text: string;
  suggestedSource?: string;
}

interface N8nService {
  chat(params: {
    currentSource: string;
    messages: ChatMessage[];
    userMessage: string;
  }): Promise<ChatResponse>;

  checkHealth(): Promise<boolean>;
}
```

- n8n Webhookへ HTTP POST
- n8nがLLM応答を解析し、構造化JSON（text + suggestedSource）を返却
- フロントエンドはJSONを受け取って表示するだけ

### 6.7 Export Service

```typescript
interface ExportService {
  exportAsJson(session: ReviewSession): void;
}
```

- ReviewSessionをJSON文字列化 → Blobダウンロード

## 7. n8nオーケストレーター設計

### 7.1 Webhookエンドポイント

| エンドポイント | 用途 |
|--------------|------|
| `POST /webhook/modellogue-chat` | チャット中継（SSEレスポンス） |

### 7.2 チャット中継ワークフロー

```
Webhook受信 → コンテキスト組み立て（systemPrompt + source + history）
→ Gemini API呼び出し → レスポンス受信
→ ```plantuml``` コードブロック検出・抽出
→ 構造化JSON返却
```

**Webhook仕様**:

```
POST /webhook/modellogue-chat
Content-Type: application/json

Request:
{
  "currentSource": "...",
  "messages": [...],
  "userMessage": "..."
}

Response:
{
  "text": "この状態遷移図には...",
  "suggestedSource": "@startuml\n[*] --> Idle\n..."
}
```

### 7.3 ワークフローのポータビリティ

- n8nワークフローはJSON形式でエクスポート可能
- `n8n/workflows/` ディレクトリにテンプレートを同梱
- ユーザーはインポート → APIキー設定で利用開始

## 8. 外部サービス連携

### 8.1 Docker Compose構成

```yaml
services:
  plantuml:
    image: plantuml/plantuml-server:jetty
    ports:
      - "8080:8080"

  n8n:
    image: docker.n8n.io/n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - GENERIC_TIMEZONE=${TIMEZONE:-Asia/Tokyo}
      - TZ=${TIMEZONE:-Asia/Tokyo}
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

Gemini APIキーはn8n UI内のCredentials設定で管理する。環境変数やコードには一切含めない。

### 8.2 環境変数

フロントエンド（.env）に必要なのは接続先URLのみ:

```
VITE_PLANTUML_SERVER_URL=http://localhost:8080
VITE_N8N_BASE_URL=http://localhost:5678
```

## 9. ディレクトリ構造

```
ModelLogue/
├── CLAUDE.md
├── LICENSE
├── Reference/
├── Doc/
│   ├── requirements/
│   │   ├── Requirements_Specification.md
│   │   ├── user_requirements.yaml
│   │   ├── system_requirements.yaml
│   │   ├── nonfunctional_requirements.yaml
│   │   └── test_strategy.yaml
│   ├── Traceability.md
│   ├── architecture.md
│   └── Security_Design.md
├── n8n/
│   └── workflows/
│       └── chat-relay.json
├── Prototype/
├── docker-compose.yml
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Header/
│   │   ├── DiagramView/
│   │   │   ├── DiagramView.tsx             # SVG + overlay layout
│   │   │   ├── SvgPreview.tsx               # PlantUML SVG + pan/zoom
│   │   │   ├── MarkerToolbar.tsx            # ⬭ ▭ ⇢ buttons
│   │   │   └── MarkerOverlay.tsx            # ネイティブSVGマーカー描画
│   │   ├── AnalysisPanel/
│   │   │   ├── AnalysisPanel.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── PlantUmlEditor.tsx         # CodeMirror
│   │   │   ├── StateEventMatrixView.tsx
│   │   │   ├── StateStateMatrixView.tsx
│   │   │   └── EbnfView.tsx
│   │   ├── ChatPanel/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── SourceDiffView.tsx
│   │   │   └── ChatInput.tsx
│   │   ├── StatusBar/
│   │   └── MainLayout.tsx
│   ├── parsers/
│   │   ├── stateMachineParser.ts
│   │   └── stateMachineSerializer.ts
│   ├── engines/
│   │   ├── matrixGenerator.ts
│   │   └── svgCoordinateExtractor.ts
│   ├── services/
│   │   ├── plantUmlService.ts
│   │   ├── n8nService.ts
│   │   └── exportService.ts
│   ├── stores/
│   │   ├── sessionStore.ts
│   │   ├── modelStore.ts
│   │   ├── chatStore.ts
│   │   ├── markerStore.ts
│   │   └── uiStore.ts
│   ├── grammars/
│   │   └── stateDiagram.ebnf
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── en.json
│   │   └── ja.json
│   ├── types/
│   │   ├── stateMachine.ts
│   │   ├── session.ts
│   │   └── matrix.ts
│   └── utils/
│       └── plantumlEncoder.ts
├── tests/
│   ├── unit/
│   │   ├── stateMachineParser.test.ts
│   │   ├── matrixGenerator.test.ts
│   │   └── svgCoordinateExtractor.test.ts
│   └── golden/
│       ├── GT-001/
│       ├── GT-002/
│       └── ...
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

## 10. ビルド・開発環境

| 項目 | 技術 |
|------|------|
| ビルドツール | Vite |
| 言語 | TypeScript (strict) |
| パッケージマネージャ | npm |
| テスト | Vitest + React Testing Library |
| フォーマッター | Prettier |
| リンター | ESLint |
| CSS | Tailwind CSS |
| コンテナ | Docker Compose（PlantUML Server + n8n） |

## 11. 判断記録（ADR）

判断記録は [`Doc/adr/`](./adr/) 配下にYAMLファイルとして格納されており、[`Doc/ADR_Index.md`](./ADR_Index.md) から自動生成されたMarkdownビューで一覧・参照できる。新規のADRは `adr` スキル経由で作成・更新する。

主要な判断記録：

| ID | タイトル |
|---|---|
| [ADR-001](./adr/ADR-001-frontend-is-pure-ui.yaml) | フロントエンドは純粋なUI（選択的適用） |
| [ADR-002](./adr/ADR-002-n8n-as-orchestrator.yaml) | n8nをオーケストレーターとして導入する |
| [ADR-003](./adr/ADR-003-frontend-parser-for-semantics.yaml) | 意味解析とテーブル生成はフロントエンドのパーサーとアルゴリズムで行う |
| [ADR-004](./adr/ADR-004-ebnf-as-static-definition.yaml) | EBNF文法は静的ファイルとして定義する |
| [ADR-005](./adr/ADR-005-ai-response-parsing-in-n8n.yaml) | AIレスポンスの解析はn8nワークフロー内で行う |
| [ADR-006](./adr/ADR-006-native-svg-overlay-for-markers.yaml) | PlantUML SVGを直接表示し、ネイティブSVGオーバーレイにマーカーを描く |
| [ADR-007](./adr/ADR-007-markers-without-element-binding.yaml) | マーカーはモデル要素に紐づけず、AIに解釈させる |
| [ADR-008](./adr/ADR-008-scope-boundary-with-surrounding-workflow.yaml) | ModelLogueのスコープ境界——前後の業務ワークフローはn8n側に委ねる |
| [ADR-009](./adr/ADR-009-composite-states-minimal-subset.yaml) | 複合状態は1階層限定の最小サブセットでサポートする |
| [ADR-010](./adr/ADR-010-external-services-for-heavy-or-domain-specific-work.yaml) | 重い処理や領域固有の生成処理は外部サービスとして同一リポジトリ内に分離する |
| [ADR-011](./adr/ADR-011-strict-formats-and-deterministic-conversion.yaml) | サービス間のフォーマットは厳密に定義し、機械的な変換は決定論的に実装する |

## 12. 将来拡張

### 12.1 補助サービスとして追加される拡張（ADR-010）

ModelLogue本体ではなく、同一リポジトリ内の独立した補助サービスとして実装する。CLI＋APIを持ち、ModelLogueからもCI/CDからも呼び出せる。

| 補助サービス | 機能 | 関連ADR |
|------|------|--------|
| Nスイッチカバレッジ生成器 | PlantUMLソース → テストケースCSV。複合状態にはレイヤード戦略 | ADR-009, ADR-010 |
| 状態遷移表変換器 | PlantUMLソース ↔ 状態遷移表CSVの双方向変換（決定論的、CSV形式は厳密定義） | ADR-010, ADR-011 |

### 12.2 ModelLogue本体の拡張

他のモデル図種への対応は、パーサーとモデルとテーブル生成器を差し替えることで実現する。

| 拡張 | パーサー追加 | モデル追加 | テーブル追加 |
|------|-----------|----------|------------|
| アクティビティ図（BPMN風） | ActivityDiagramParser | ActivityModel | DecisionTable |
| 要求帰納系統図 | RequirementsTreeParser | RequirementsModel | DerivationMatrix |
| クラシフィケーションツリー | ClassificationTreeParser | ClassificationModel | FactorLevelTable |

拡張時のアーキテクチャへの影響は最小限（パーサー＋モデル＋テーブルの差し替えのみ）。各図種にも対応する補助サービス（テスト生成器、CSV変換器など）が並ぶ可能性がある。
