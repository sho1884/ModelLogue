# ModelLogue アーキテクチャ設計書

**バージョン**: 5.0
**作成日**: 2026-04-07
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

  updateSource: (source: string, triggeredBy: string) => void;
  applyProposal: (messageId: string, source: string) => void;
  undoSource: () => void;
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
- 対応構文: `[*] -->`, `A --> B : event [guard] / action`, `state "name" as alias`

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
  rowHeaders: string[];     // 状態名
  columnHeaders: string[];  // イベント名 or 状態名
  cells: (string | null)[][]; // セル値（遷移先 or イベント or null）
}
```

- StateMachineModelから純粋に算出
- 副作用なし、即時計算

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

### ADR-001: フロントエンドは純粋なUI（選択的適用）

- **決定**: SPAは表示と接続に専念。秘密情報を持たない。ただしモデルの意味解析と表生成はフロントエンドで実行する。
- **理由**: オープンソース + セルフホスト前提。Volatile Canvas思想。意味解析はLLM不要の確定的処理であり、フロントエンドで完結させることで堅牢性とレスポンスを確保する。

### ADR-002: n8nをオーケストレーターとして導入

- **決定**: n8nがAI中継を担う。将来の外部連携もn8n経由。
- **理由**: APIキー管理の一元化。ワークフロー追加で拡張可能。
- **トレードオフ**: Docker環境必要だが、PlantUML Serverと同様。

### ADR-003: 意味解析はフロントエンドのパーサー

- **決定**: PlantUMLサブセットのパーサーをフロントエンドに持ち、StateMachineModelを自前で構築する。テーブル生成も純粋アルゴリズムで実行する。
- **旧決定からの変更**: テーブル生成をLLMに委譲する方針を撤回。
- **理由**:
  - PlantUMLの状態遷移図サブセットは文法が限定的であり、パーサーの実装コストは低い
  - LLM依存を排除することで、AIなしでも図＋表の表示が成立する
  - NeoCEGで確立した「テキスト→正規モデル→図＋表」パターンを踏襲
  - パーサーは純粋関数であり、テストが容易

### ADR-004: EBNFは静的定義

- **決定**: EBNF文法はフロントエンドに静的ファイルとして持つ。
- **理由**: 文法定義は変更頻度が低く、LLM生成は不安定。静的定義が最も信頼性が高い。

### ADR-005: AIレスポンスの解析はn8n側

- **決定**: LLMレスポンスからのPlantUMLコードブロック抽出はn8nワークフロー内で実行。
- **理由**: フロントエンドは受け取ったJSONを表示するだけ。

### ADR-006: SVGを直接表示し、ネイティブSVGオーバーレイにマーカーを描く

- **決定**: PlantUML Serverから取得したSVGをそのまま `<img>` または `<svg>` で表示し、その上にネイティブSVGのオーバーレイ層を重ねてマーカー（楕円・矩形・矢印）を描く。React FlowもExcalidrawも使用しない。
- **旧決定からの変更**:
  - React Flowで図を描き直す方針を撤回（v3.0）
  - その後Excalidrawをホワイトボードとして使う方針も撤回（v5.0）
- **理由**:
  - React Flowで描き直すとエッジルーティングとラベル配置がPlantUMLと一致せず、図の品質が低い（実装で確認済み）
  - Excalidrawは多機能すぎて、必要な「マーカーを置く」操作を実現するために遠回りする必要があった（IDがランダム置換される、削除がうまく効かない、独自描画機能との混乱、など）
  - 必要なのは「ここに注目を示せるマーカー」だけ。それなら200行程度のネイティブSVG実装で十分
  - 余計な依存（Excalidraw 1.8MB）が消え、見た目とイベント挙動を完全にコントロールできる
  - 将来のリアルタイム協調編集も、マーカーの差分をWebSocketで送るだけで実装できる

### ADR-007: マーカーはモデル要素に縛らず、AIに解釈させる

- **決定**: マーカーは特定のモデル要素IDに紐づけない。MarkerStoreはマーカーの座標と色だけを持ち、AIチャットコンテキストとして「マーカー一覧」と「モデル要素の座標」の両方を渡す。AIが必要に応じて「赤の楕円はIdle状態を指していますね」と解釈し、曖昧なら人間に質問する。
- **旧決定からの変更**: マーカーをモデル要素に厳密に紐づける案を撤回（v4.1）
- **理由**:
  - 人間は一発で正確にクリックできない。厳密照合は失敗時のリカバリーが面倒
  - 状態遷移図に限らず、将来のあらゆるモデル図（アクティビティ図・要求系統図等）で同じ仕組みが使える
  - 「だいたいこのあたり」という人間のレビュー所作と合致する
  - AIは元々曖昧性に強い。座標情報を渡せばAIが適切に解釈してくれる
  - マーカー実装側の責任が減り、シンプルで堅牢になる

## 12. 将来拡張

現在のスコープは状態遷移図に限定しているが、パーサーとモデルを差し替えることで他の図種にも対応可能。

| 拡張 | パーサー追加 | モデル追加 | テーブル追加 |
|------|-----------|----------|------------|
| Nスイッチカバレッジ | 不要 | 不要 | NswitchCoverageGenerator |
| アクティビティ図（BPMN風） | ActivityDiagramParser | ActivityModel | DecisionTable |
| 要求帰納系統図 | RequirementsTreeParser | RequirementsModel | DerivationMatrix |
| クラシフィケーションツリー | ClassificationTreeParser | ClassificationModel | FactorLevelTable |

拡張時のアーキテクチャへの影響は最小限（パーサー＋モデル＋テーブルの差し替えのみ）。
