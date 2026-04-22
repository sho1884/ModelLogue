# ModelLogue アーキテクチャ設計書

**バージョン**: 7.2 (planned / 承認済・未実装)
**作成日**: 2026-04-08
**最終更新**: 2026-04-15
**ステータス**: v7.0 は MVP、v7.1 は実装済（要求仕様タブ・読み取り専用ソース・モデル before/after 比較・EBNF ダウンロード）。v7.2 は UX 改善済（lock条件修正、Undo+Redo、Save 文言、エンプティステート、個別エクスポート、英語UI統一）。v7.3 は外部 CLI（[`tools/nswitch/`](../tools/nswitch/)）との整合を取るための SR-101 正規 CSV 化（planned）。

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
ユーザーメッセージ + コンテキスト（currentSource + history + markerContext + grammarSpec）
  → n8n webhook → Gemini API → レスポンス
  → 構造化JSON { text, suggestedSource? } を返却
  → フロントエンドで提案ソースを表示（コードブロック＋Applyボタン）
  → Apply → SessionStore.applyProposal / ChatStore.markApplied → Source更新
  → Source変更 → Parser再実行 → 全パイプライン再実行
```

AIレスポンスの解析（```plantuml コードブロック抽出）はADR-005に従いn8n側で行うのが正だが、Phase 1では反復速度を優先してフロントエンド（`services/n8nService.ts::extractPlantUmlBlock`）で実装している。n8nが `suggestedSource` を事前抽出して返すパスも既に受け入れ済みなので、Phase 2以降でn8n側に移設してもフロントエンドの変更は不要（ドロップイン置換）。

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
├── Header                             # セッション名 + Close Session ボタン
├── MainLayout
│   ├── WorkArea（左側）
│   │   ├── DiagramView
│   │   │   ├── MarkerToolbar        # [select | pan | ⬭ | ▭ | ⇢]
│   │   │   └── (inline) PlantUML SVG + MarkerShape[] オーバーレイ
│   │   │                              # SVG表示・pan/zoom・マーカー描画は
│   │   │                              # DiagramView.tsx 内で一体化
│   │   ├── ResizeHandle              # AnalysisPanel の上端（縦方向リサイズ）
│   │   └── AnalysisPanel
│   │       │                          # タブは内部でswitch実装（TabBar分離なし）
│   │       ├── SourceEditor          # CodeMirror — Source tab
│   │       ├── MatrixView            # S×E / S×S タブで共通利用
│   │       └── EBNF tab              # 現在は「coming soon」プレースホルダ
│   │                                  # （SR-050 deferred）
│   ├── ResizeHandle                  # ChatPanel の左端（横方向リサイズ）
│   └── ChatPanel                     # 右側・全高さ
│       │                              # メッセージ一覧・入力欄・提案ソースブロック＋Apply
│       │                              # ボタンは ChatPanel.tsx 単一ファイルに集約
│       └── (inline) messages / input / suggested-source + Apply
├── StatusBar                         # PlantUML Server / n8n 接続状態
└── CloseSessionDialog                # ポータル表示・3つの outcome + note + JSON ダウンロード
```

※ Phase 1 では画面要素の細分化を意図的に抑え、TabBar / MessageList / SourceDiffView といった子コンポーネントは親ファイルに統合されている。将来の拡張（SR-033の本格的な差分ビュー、EBNFViewなど）で必要になった時点で分離する。

## 5. ステート管理

Zustandを使用。ストアは責務ごとに分離する。

```typescript
// SessionStore — ソース＆履歴管理（エクスポート機能も内包）
interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  currentSource: string;
  sourceHistory: SourceSnapshot[];
  outcome: SessionOutcome | null;

  updateSource: (source: string, triggeredBy: string) => void;
  applyProposal: (messageId: string, source: string) => void;
  undoSource: () => void;
  closeSession: (status: SessionOutcomeStatus, note: string | null) => void;
  exportSession: () => ReviewSession;  // 別Serviceには切り出さず、ストアが生成
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
  coordinates: CoordinateMap;  // SvgCoordinateExtractor が埋める（SR-011）

  parseSource: (source: string) => void;
  setCoordinates: (map: CoordinateMap) => void;
}

// ChatStore — AI対話管理（メッセージの正本はこちら。SessionStoreのmessagesは未使用）
interface ChatStore {
  messages: ChatMessage[];
  isSending: boolean;             // Phase 1 は非ストリーミング（単発JSON）
  lastError: string | null;

  sendMessage: (content: string) => Promise<void>;
  markApplied: (messageId: string) => void;  // Apply時にChatPanelから呼ぶ
  clear: () => void;
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

interface ChatRequest {
  currentSource: string;                   // コンテキストとしてのPlantUMLソース
  history: { role: 'user' | 'assistant'; content: string }[];
  userMessage: string;
  markerContext: string;                   // マーカー + 座標のヒト可読サマリ（SR-022）
  grammarSpec: string;                     // EBNF 全文（SR-022, SR-050）
}

interface N8nService {
  chat(req: ChatRequest): Promise<ChatResponse>;
  checkHealth(): Promise<boolean>;
}
```

- n8n Webhookへ HTTP POST（単発JSONレスポンス。Phase 1はSSEを使わない）
- 受信したJSONは `{ text, output, message, response }` のいずれかのフィールドから本文を取り出す正規化ロジックを通す
- Phase 1 では ```plantuml コードブロック抽出をフロントエンド側（`extractPlantUmlBlock`）で実施。ADR-005 の方針（n8n側で抽出）は維持し、Phase 2 でn8nワークフローに移設予定
- n8n が `suggestedSource` を事前抽出して返すパスもそのまま受け入れる（ドロップイン置換可能）

### 6.7 セッションエクスポート

独立した ExportService は設けず、`SessionStore.exportSession()` が `ReviewSession` オブジェクトを組み立てて返す。呼び出し側（`CloseSessionDialog`）が `JSON.stringify` → Blob ダウンロードまで行う。

組み立て時に `ChatStore.messages` と `MarkerStore.markers` を読み出してまとめる点がポイント（メッセージの正本は ChatStore 側にあるため）。

## 7. n8nオーケストレーター設計

### 7.1 Webhookエンドポイント

| エンドポイント | 用途 |
|--------------|------|
| `POST /webhook/modellogue-chat` | チャット中継（単発JSONレスポンス。Phase 1） |

### 7.2 チャット中継ワークフロー

```
Webhook受信 → コンテキスト組み立て（systemPrompt + currentSource + history + markerContext + grammarSpec）
→ Gemini API呼び出し（AI Agent node, Retry On Fail）→ レスポンス受信
→ 単発JSONで返却
  （Phase 1: ```plantuml コードブロック抽出はフロントエンド側で実施）
  （Phase 2: ADR-005 に従いここで抽出し suggestedSource を付与）
```

**Webhook仕様**:

```
POST /webhook/modellogue-chat
Content-Type: application/json

Request:
{
  "currentSource": "...",
  "history": [{ "role": "user", "content": "..." }, ...],
  "userMessage": "...",
  "markerContext": "Marker m-1 (red ellipse) overlaps state Idle ...",
  "grammarSpec": "(* ModelLogue PlantUML State Diagram Subset Grammar *) ..."
}

Response (Phase 1):
{
  "text": "この状態遷移図には...\n```plantuml\n@startuml\n...\n```\n",
  // suggestedSource はフロントエンドで text から抽出する
}

Response (Phase 2 目標):
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
│   │   ├── Header/Header.tsx
│   │   ├── DiagramView/
│   │   │   ├── DiagramView.tsx              # SVG + オーバーレイ + pan/zoom（統合）
│   │   │   ├── MarkerToolbar.tsx            # [select | pan | ⬭ | ▭ | ⇢]
│   │   │   └── MarkerShape.tsx              # 個別マーカー描画（楕円/矩形/矢印）
│   │   ├── AnalysisPanel/
│   │   │   ├── AnalysisPanel.tsx            # タブ切替は内部で switch
│   │   │   ├── SourceEditor.tsx             # CodeMirror
│   │   │   └── MatrixView.tsx               # S×E / S×S で共通利用
│   │   ├── ChatPanel/
│   │   │   └── ChatPanel.tsx                # メッセージ・入力・提案ソース+Apply 統合
│   │   ├── StatusBar/StatusBar.tsx
│   │   ├── ResizeHandle.tsx                 # 縦横リサイズ共通部品
│   │   ├── CloseSessionDialog.tsx           # outcome 入力 + JSON ダウンロード
│   │   └── MainLayout.tsx
│   ├── parsers/
│   │   └── stateMachineParser.ts            # Serializer は不要と判断（SR-003 removed）
│   ├── engines/
│   │   ├── matrixGenerator.ts
│   │   └── svgCoordinateExtractor.ts
│   ├── services/
│   │   ├── plantUmlService.ts
│   │   ├── n8nService.ts
│   │   └── markerContext.ts                 # マーカー+座標のヒト可読サマリ生成
│   ├── stores/
│   │   ├── sessionStore.ts                  # exportSession もここ
│   │   ├── modelStore.ts
│   │   ├── chatStore.ts
│   │   ├── markerStore.ts
│   │   └── uiStore.ts
│   ├── grammars/
│   │   └── stateDiagram.ebnf                # ?raw import で文字列として取り込む
│   ├── types/
│   │   ├── stateMachine.ts
│   │   ├── session.ts
│   │   └── matrix.ts
│   └── vite-env.d.ts
│   # 注: i18n/ は当初計画にあったが Phase 1 では未実装（UI英日対応は deferred）
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

---

## 13. v7.1 変更（planned）

v7.0 の記述はそのまま MVP の現状記録として残す。ここでは v7.1 で変わる点を差分として記す。実装着手前の合意用。

### 13.1 方針の変更点

- **ソースは読み取り専用の参照**に格下げ。手編集は「セッションが空の時の一度だけ（seed）」にのみ許可。以降はすべて AI 提案 → Apply で変更する。未ログの直接編集を排除し、「Dialogue as Asset」を破綻なく保つ。
- **要求仕様タブを新設**（SR-080）。このモデル分の短い要求仕様文（目安 4000 字、上限 8000 字）を、セッション中は読み取り専用で常時参照できる。レビュー後の自然言語反映は ModelLogue の外で行う（ADR-008 境界維持）。
- **モデル生成ボタン（SR-082）**: 要求仕様文を込めてチャットへ「初版モデルを作って」と投げる shortcut。通常のチャット経路を使うので意図は対話ログに残る。
- **EBNF タブは廃止**。代わりにダウンロードリンク（SR-081）で静的ファイルを提供。
- **提案の視覚化**: `SourceDiffView` は廃止し、モデル図 before/after の**並置 + 差分オーバーレイ**による `ProposalView` に置き換え（SR-033）。差分は純粋アルゴリズムでモデルレベルに計算（SR-090）。オーバーレイはマーカーと同じネイティブ SVG 層を再利用。
- **デフォルトマーカーツールを pan に**（SR-012）。セッション開始時はマーカーが無いので select は実質無意味だった。

### 13.2 新しいコンポーネント / ストア

```typescript
// RequirementsStore — 要求仕様文の保持（セッション中は読み取り専用）
interface RequirementsStore {
  requirementsText: string;
  setRequirementsText: (text: string) => void;  // seed 時のみ有効
  isSeedable: () => boolean;                    // text が空 かつ source が空 の時 true
  characterCount: () => number;                 // UI の文字数表示用
}
```

`RequirementsStore.setRequirementsText` は内部で `isSeedable()` をチェックし、ロック済みなら no-op（開発時は console.warn）。

```typescript
// modelDiff — 純粋関数（SR-090）
interface ModelDiff {
  addedStates: State[];
  removedStates: State[];
  changedStates: { before: State; after: State }[];
  addedTransitions: Transition[];
  removedTransitions: Transition[];
  changedTransitions: { before: Transition; after: Transition }[];
}

function diffModels(before: StateMachineModel, after: StateMachineModel): ModelDiff;
```

`src/engines/modelDiff.ts` に配置。I/O もフレームワーク依存もなし。

```typescript
// ProposalView — チャットメッセージ内で提案を視覚化
interface ProposalViewProps {
  currentSource: string;
  suggestedSource: string;       // SR-032 で抽出済み
  onApply: () => void;
  messageId: string;
}
```

責務: 提案ソースに対して PlantUML Server にもう一度レンダリング要求を出し、返ってきた SVG の上に `diffModels` の結果をマッピングしたオーバーレイを描く。レイアウトは現モデル SVG との左右並置。オーバーレイは既存の `MarkerShape` / `MarkerOverlay` 層と同じ `SvgCoordinateExtractor` の出力を再利用する。

### 13.3 セッションブートストラップ（SR-083）

```
URL ?requirements=...&source=...&sessionName=...
  OR
<input type="file"> → JSON { requirementsText?, plantUmlSource?, sessionName? }
  ↓
SessionStore.bootstrap({...}) 
  → RequirementsStore.setRequirementsText (空でなければロック)
  → SessionStore.updateSource (空でなければロック)
  → その後は通常のレビュー（全 seed 消費済み）
```

URL パラメータは長文に向かないので、長い要求仕様の渡し方は `postMessage` やファイル import を推奨（n8n 側から投入する想定）。

### 13.4 タブ構成の変更

`AnalysisPanel` のタブセット:

```
v7.0:  [ Source | S×E | S×S | EBNF(placeholder) ]
v7.1:  [ Requirements | Source | S×E | S×S ]
```

EBNF は Header か Help メニューに「EBNF をダウンロード」アクションとして移動。

### 13.5 データモデルの追加

`ReviewSession` に `requirementsText: string` を追加（エクスポート JSON に含まれる）。`sourceHistory` に相当する `requirementsHistory` は **v7.1 では持たない**（text は seed 時点で固定される運用）。

### 13.6 n8n チャット I/F の追加フィールド

既存の `ChatRequest` に `requirementsText?: string` を追加。n8n 側は要求仕様があれば system prompt 冒頭に注入する運用（具体のプロンプト設計は n8n ワークフロー側の話なので本設計書では指定しない）。

### 13.7 ADR への影響

- **ADR-008 は維持**。v7.1 の補則（短い要求仕様断片の受け取り口だけを本体に設け、大抽出と再導出は外部に残す）を ADR-008 YAML の `v7_1_amendment` ブロックに追記済み。
- 新規 ADR は作らない。

### 13.8 実装順の目安

1. `RequirementsStore` + Requirements タブ（読み取り・seed 編集）
2. SR-012 のデフォルトを pan に、EBNF タブを download リンクに置換
3. `SourceEditor` を読み取り専用モードに変更（seed 編集は session が空の時のみ）
4. `modelDiff` エンジンの純粋実装 + ユニットテスト（SR-090）
5. `ProposalView`（SVG 再生成 + オーバーレイ）で `ChatPanel` の既存ソース提案表示を置き換える
6. `SessionStore.bootstrap` と URL / ファイル import の I/F（SR-083）
7. `exportSession` に `requirementsText` を含める

---

## 14. v7.2 変更（planned）

v7.2 は v7.1 のスモークテストで判明した UX 課題を解消する。仕様の骨格は変えず、状態遷移と UI 配置・文言を直す。

### 14.1 セッション状態を SEED / REVIEW の 2 フェーズに明確化

v7.1 では「source が非空」を lock 条件にしていたため、**シード時に文法エラー入りの PlantUML を貼ると再編集できなくなって詰む**問題があった。v7.2 では SEED → REVIEW の状態遷移を**最初の successful parse**で起こす。

```typescript
// SessionStore に追加
interface SessionStore {
  // ...
  hasEstablishedModel: boolean;          // SEED → REVIEW フラグ（true 化したら戻らない）
  markModelEstablished: () => void;      // model parse が成功した瞬間に呼ぶ
}
```

`markModelEstablished` は **modelStore.parseSource が成功（model !== null）した瞬間に呼ばれる**（modelStore から sessionStore に通知、または selector で派生）。`SourceEditor` と `RequirementsTab` の `isSeedable` 判定はこのフラグを参照する。

### 14.2 Undo / Redo（diagram toolbar に移設）

```typescript
interface SessionStore {
  sourceHistory: SourceSnapshot[];   // undo stack
  redoStack: SourceSnapshot[];       // 新規
  undoSource: () => void;            // history → redoStack へ push
  redoSource: () => void;            // redoStack → history へ push
}
```

ルール: **applyProposal / updateSource / bootstrap が走ると redoStack をクリア**（新しい分岐が canonical になる）。

UI: `MarkerToolbar` の右隣に `↶ Undo` / `↷ Redo` を 2 ボタンで配置。enable/disable で affordance は維持（hide しない）。

### 14.3 Save dialog（CloseSessionDialog → SaveAndFinishDialog）

ファイル名・コンポーネント名も改名。ダイアログには **「This file will contain」のチェックリスト**を出す:

- Final PlantUML source — the model you ended up with
- Requirements text — what you started from
- Full chat log — the dialogue that shaped the model
- All applied source snapshots — every step of the model's evolution
- Markers — review annotations on the diagram
- Outcome and optional note
- Session metadata

主アクション: **Download JSON**（旧「セッション終了」相当の主操作だが、ファイル生成であることが明示される）。

### 14.4 Open saved review（旧 Seed Import）

Header ボタン名を `Seed Import` → `Open saved review…` に変更。`bootstrapFromBundle` を以下のいずれの shape も受理するように拡張:

- **SeedBundle**: `{ requirementsText?, plantUmlSource?, sessionName? }`（外部ワークフロー由来）
- **ReviewSession**: Save & finish が出力する完全な ReviewSession JSON。importer は `requirementsText` / `plantUmlSource` / `sessionName` だけを抽出し、`messages` / `sourceHistory` / `markers` / `outcome` は破棄（Volatile Canvas を維持）

判定ロジック: パース後の object に `messages` フィールドがあれば ReviewSession として扱い、抽出 → SeedBundle 化 → 既存パスへ。

### 14.5 DiagramView エンプティステート（SR-070）

`currentSource.trim() === ''` の時:
- **PlantUML Server を呼ばない**（welcome image を抑止）
- 中央に英語の案内: *"No model yet. Describe what the model should do in the Requirements tab, then press Generate model — or paste a PlantUML source into the Source tab."*
- マーカーツールバーとオーバーレイは非表示

### 14.6 個別エクスポート（SR-100 / SR-101）

ヘルパー: `src/services/clipboard.ts`（Copy with toast）と `src/engines/matrixSerializer.ts`（表示用マトリクスの TSV/HTML 化）、`src/engines/transitionTableSerializer.ts`（v7.3 新設：`StateMachineModel` → 正規 state-transition-table CSV）。

**v7.2 の状態（現行）**: 画面上のマトリクスをそのまま TSV/CSV 化して出力。Copy も Save も同じ人間向けマトリクス形式。

**v7.3 の変更（planned）**: SR-101 と外部ツール（[`tools/nswitch/`](../tools/nswitch/)）の整合のため、正規 state-transition-table CSV を採用する。対応表は以下。

| 経路 | v7.2 | v7.3 |
|---|---|---|
| HTML clipboard payload | 人間向けマトリクス（`<table>`） | 同左（Excel/Word への貼り付け互換を優先） |
| Plain-text clipboard payload | 人間向けマトリクスの TSV | **正規 CSV**（AI プロンプト・テキストエディタで直接 CLI に投入可） |
| Save file | 人間向けマトリクスの CSV | **正規 CSV**（[`tools/nswitch/Requirements_Specification.md`](../tools/nswitch/Requirements_Specification.md) §4.2 に準拠） |

```typescript
// matrixSerializer.ts — on-screen matrix のフォーマッタ（HTML clipboard 用として残存）
export function matrixToTsv(m: MatrixData): string;
export function matrixToHtml(m: MatrixData): string;

// transitionTableSerializer.ts — v7.3 新設
// StateMachineModel → 正規 state-transition-table CSV（tools/nswitch と共有）
export function modelToCanonicalCsv(model: StateMachineModel): string;
```

UI: SourceEditor のヘッダ右に `Copy` / `Save .puml`、MatrixView のヘッダ右に `Copy` / `Save .csv`。共通の小さなコンポーネント `<ExportActions />` を作って 2 ボタンを統一。v7.3 では MatrixView 側の Copy/Save 実装を `transitionTableSerializer` に差し替える（UI レイアウトは不変）。

### 14.7 英語 UI 統一

文言マッピングは Requirements_Specification.md 側に記載。コード上は CloseSessionDialog と Header の Outcome バッジ、Status Bar、ProposalView/Modal の日本語残りを英語化。i18next は引き続き未導入（deferred）。

### 14.8 実装順

1. SessionStore に `hasEstablishedModel` / `redoStack` / `redoSource` 追加
2. modelStore.parseSource 成功時に sessionStore に通知（subscribe か派生 selector）
3. SourceEditor / RequirementsTab を新 lock 条件に
4. ChatPanel から Undo を撤去、MarkerToolbar 横に Undo/Redo 配置
5. DiagramView エンプティステート（source 空時は SVG fetch しない）
6. Header の文言と `Open saved review` 化
7. SaveAndFinishDialog にリネーム＋ contents checklist
8. bootstrapFromBundle が ReviewSession 形式も受理
9. matrixSerializer + clipboard helper、Source タブ + MatrixView に Copy/Save 配置
10. ProposalView/Modal/Outcome バッジ英語化
11. tsc / vitest / build

---

## 15. v7.3 変更（planned）

v7.3 のスコープは SR-101 のエクスポート CSV を、外部 CLI（[`tools/nswitch/`](../tools/nswitch/)）と同一の**正規 state-transition-table CSV** に切り替えることに絞る。UI・モデル・パーサーには手を入れない。

### 15.1 動機

v7.2 の SR-101 は「画面マトリクスをそのまま CSV 化」したもので、**CLI 側が必要とする情報（state の id と label の区別、`parent`、`type=composite`、`initial=Y`、ガード/アクション、`[*]` 遷移）が欠落している**。ModelLogue で保存した CSV を `modellogue-nswitch` に食わせてラウンドトリップさせるためには、両者が同じフォーマットを採用する必要がある。仕様の本体は [`tools/nswitch/Requirements_Specification.md`](../tools/nswitch/Requirements_Specification.md) §4.2 に定める。

### 15.2 差分

| 経路 | v7.2 | v7.3 |
|---|---|---|
| HTML clipboard | 人間向けマトリクスの `<table>` | 同左（Excel 貼り付け互換） |
| Plain-text clipboard | 人間向けマトリクスの TSV | **正規 CSV** |
| Save file | 人間向けマトリクスの CSV | **正規 CSV** |
| 画面表示（SR-020） | 人間向けマトリクス | 同左（不変） |

### 15.3 新規コンポーネント

- `src/engines/transitionTableSerializer.ts` — `modelToCanonicalCsv(model: StateMachineModel): string`。擬似状態（initial/final）は行として出力せず、`initial` 列と `[*]` セル値に畳み込む（§4.2.3）。`label` は空文字のときは出さない。イベント列の順序は `StateMachineModel.events` の既定順を採用。

### 15.4 実装順

1. `transitionTableSerializer.ts` を追加し、単体テスト（flat / composite 入りの両パターン）を作成
2. ラウンドトリップテスト（PlantUML → model → canonical CSV → パース → 構造一致）を作成（tools/nswitch 実装時に共有コーパス化する）
3. `MatrixView` の Save / plain-text Copy 実装を差し替え（HTML Copy は `matrixSerializer.matrixToHtml` のまま）
4. tsc / vitest / build

### 15.5 後続

- v7.3 着地後、`tools/nswitch` 本体の Python 実装に着手（別リポジトリ構成にせず `tools/nswitch/` に同居、ADR-010）。
- 共有ゴールデン入力コーパス（`tools/nswitch/tests/shared_corpus/` 予定）を TS 側の単体テストからも参照し、両パーサーの等価性を CI で担保する。

