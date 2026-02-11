# ModelLogue アーキテクチャ設計書

**バージョン**: 2.0
**作成日**: 2026-02-11
**ステータス**: ドラフト

---

## 1. アーキテクチャ概要

ModelLogueは「持たないアーキテクチャ」を徹底する。フロントエンドSPAは純粋なUIであり、重い処理はすべて外部サービス（PlantUML Server、n8n + LLM）に委譲する。

### システム構成図

```
┌──────────────────────────────────────────────────────────────────┐
│                    ブラウザ（SPA — 純粋なUI）                       │
│                                                                  │
│  ┌─────────────────────────────┐  ┌───────────────────────────┐  │
│  │     DiagramView (SVG)       │  │     ChatPanel             │  │
│  │     モデル図（主役）          │  │     AI対話                 │  │
│  ├─────────────────────────────┤  │                           │  │
│  │     AnalysisPanel (タブ)     │  │                           │  │
│  │  [Source|Table|TestCases|EBNF]│  │                           │  │
│  └──────────┬──────────────────┘  └────────────┬──────────────┘  │
│             │                                  │                 │
│  ┌──────────┴──────────────────────────────────┴──────────────┐  │
│  │                    Zustand ストア                            │  │
│  └──────┬───────────────────┬────────────────────┬────────────┘  │
│         │                   │                    │               │
│  ┌──────┴──────┐  ┌────────┴────────┐  ┌────────┴────────────┐  │
│  │ PlantUml    │  │ n8n             │  │ TestCase            │  │
│  │ Service     │  │ Service         │  │ Engine              │  │
│  │ (HTTP GET)  │  │ (Webhook POST)  │  │ (純粋アルゴリズム)    │  │
│  └──────┬──────┘  └────────┬────────┘  └─────────────────────┘  │
└─────────┼──────────────────┼─────────────────────────────────────┘
          │                  │
          ▼                  ▼
  ┌──────────────┐  ┌──────────────────────┐
  │ PlantUML     │  │  n8n (Docker)         │
  │ Server       │  │  ┌────────────────┐  │
  │ (Docker)     │  │  │ Gemini API     │  │
  │              │  │  │ (チャット中継)   │  │
  │ source → SVG │  │  │ (テーブル生成)   │  │
  └──────────────┘  │  ├────────────────┤  │
                    │  │ Slack/Teams/   │  │
                    │  │ Discord        │  │
                    │  │ (Phase 3)      │  │
                    │  ├────────────────┤  │
                    │  │ GitHub API     │  │
                    │  │ (Phase 3)      │  │
                    │  └────────────────┘  │
                    └──────────────────────┘
```

## 2. 設計原則

### 2.1 持たないアーキテクチャ

- フロントエンドは**表示と接続**に専念する
- 図のレンダリング → PlantUML Server
- AI対話・テーブル生成 → n8n + LLM
- テストケース生成 → 純粋アルゴリズム（唯一フロントエンドが計算する部分）
- 永続化 → エクスポート（Phase 1）/ GitHub（Phase 3）

### 2.2 リアクティブパイプライン

PlantUMLソースを起点として、すべてのビューがリアクティブに更新される。

```
Source変更
 ├── debounce(500ms) → PlantUML Server → SVG → DiagramView
 ├── debounce(1500ms) → n8n/LLM → テーブル(JSON) → TableView
 │                                       └─→ アルゴリズム → TestCasesView
 └── 即時 → モデル種別検出 → EBNF(静的定義) → EbnfView
```

### 2.3 n8nがオーケストレーター

- AI対話の中継、テーブル生成、外部連携はすべてn8nが担う
- APIキーはn8n側で管理し、フロントエンドには露出しない
- n8nワークフローはJSONエクスポート可能 → リポジトリに同梱

### 2.4 オープンソース＋セルフホスト

- MIT License
- ユーザーは自身の環境にセルフホスト可能
- Docker Compose で PlantUML Server + n8n を同時起動

## 3. リアクティブデータフロー

### 3.1 概要

PlantUMLソースが**唯一の情報源（Single Source of Truth）**。ソース変更に応じて各ビューがリアクティブに派生する。

| パイプライン | 入力 | 処理場所 | 出力 | 想定遅延 |
|------------|------|---------|------|---------|
| 図レンダリング | Source | PlantUML Server (HTTP GET) | SVG | ~1s |
| テーブル生成 | Source + ModelType | n8n → LLM | テーブル JSON | ~3s |
| テストケース | テーブル JSON | フロントエンド内アルゴリズム | テストケース配列 | <100ms |
| EBNF表示 | ModelType | フロントエンド内 静的定義参照 | EBNF文法テキスト | 即時 |
| モデル種別検出 | Source | フロントエンド内 キーワードマッチ | ModelType enum | 即時 |

### 3.2 チャットフロー

```
ユーザーメッセージ + コンテキスト（Source）
  → n8n webhook → LLM → レスポンス
  → n8nが ```plantuml``` コードブロックを検出・抽出
  → 構造化JSON { text, suggestedSource } を返却
  → フロントエンドで差分ビュー表示 → 「適用」→ Source更新
  → Source変更 → 全パイプライン再実行
```

**ポイント**: AIレスポンスの解析（コードブロック抽出）はn8n側で行い、フロントエンドには構造化データのみを渡す。フロントエンドに `parseAiResponse` のようなパーサは不要。

### 3.3 プロンプトエンジニアリング

プロンプトはn8n側で管理する。フロントエンドはプロンプトの内容を知らない。

n8nワークフロー内で、モデル種別に応じたシステムプロンプトを選択し、LLMに構造化データを生成させる。

| プロンプト | 用途 | 出力形式 |
|-----------|------|---------|
| chat-system-prompt | チャット対話のシステムプロンプト | テキスト（PlantUMLコードブロック含む） |
| analyze-state-diagram | 状態遷移図 → テーブル変換 | JSON |
| analyze-mindmap | マインドマップ → 因子水準表変換 | JSON |

## 4. UIレイアウト＆コンポーネント設計

### 4.1 画面構成

```
┌──────────────────────────────────────────────────────────────┐
│  Header (Logo / SessionName / ExportButton)                   │
├──────────────────────────────────────┬───────────────────────┤
│                                      │                       │
│  DiagramView（主役・最大領域）         │  ChatPanel            │
│  SVG表示（パン/ズーム）               │  （全高さ）            │
│                                      │  MessageList          │
│                                      │  SourceDiffView       │
├─ ─ ─ ─ ─ drag handle ─ ─ ─ ─ ─ ─ ─ ┤  ChatInput            │
│  ▲ AnalysisPanel（タブ付き）          │                       │
│  [Source │ Table │ TestCases │ EBNF]  │                       │
│  ──────────────────────────────────  │                       │
│  (アクティブタブのコンテンツ)          │                       │
├──────────────────────────────────────┴───────────────────────┤
│  StatusBar (PlantUML / n8n / AI)                              │
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
│   │   │   └── SvgPreview（pan/zoom: react-zoom-pan-pinch）
│   │   └── AnalysisPanel（リサイズ可能・折りたたみ可能）
│   │       ├── TabBar [Source | Table* | TestCases* | EBNF*]
│   │       ├── PlantUmlEditor（CodeMirror — Source tab）
│   │       ├── AnalysisTable*（Table tab）
│   │       ├── TestCaseView*（TestCases tab）
│   │       └── EbnfView*（EBNF tab）
│   └── ChatPanel（右側・全高さ）
│       ├── MessageList
│       │   ├── UserMessage
│       │   └── AssistantMessage
│       │       └── SourceDiffView → ApplyButton
│       └── ChatInput
└── StatusBar
    ├── PlantUmlServerStatus
    ├── N8nStatus
    └── AiStatus

* = Phase 2
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

// ChatStore — AI対話管理
interface ChatStore {
  messages: ChatMessage[];
  isStreaming: boolean;

  sendMessage: (content: string) => Promise<void>;
}

// AnalysisStore — テーブル・テストケース管理（Phase 2）
interface AnalysisStore {
  modelType: ModelType | null;
  analysisTable: AnalysisTableData | null;
  testCases: TestCase[] | null;
  isTableLoading: boolean;

  detectModelType: (source: string) => void;
  generateTable: (source: string) => Promise<void>;
  computeTestCases: () => void;
}

// UiStore — レイアウト＆接続状態
interface UiStore {
  analysisPanelHeight: number;
  analysisPanelCollapsed: boolean;
  activeAnalysisTab: 'source' | 'table' | 'testcases' | 'ebnf';
  chatPanelWidth: number;
  theme: 'light' | 'dark';

  plantUmlStatus: 'connected' | 'disconnected' | 'checking';
  n8nStatus: 'connected' | 'disconnected' | 'checking';
}
```

## 6. サービス層

### 6.1 PlantUML Service

```typescript
interface PlantUmlService {
  renderSvg(source: string): Promise<string>;
  checkHealth(): Promise<boolean>;
}
```

- PlantUMLソースを Deflate + Base64 エンコード → HTTP GET
- plantuml-encoder ライブラリを使用
- デバウンス: 500ms

### 6.2 n8n Service

```typescript
// n8nが返す構造化レスポンス
interface ChatResponse {
  text: string;                // AI応答テキスト
  suggestedSource?: string;    // 抽出済みPlantUMLソース（あれば）
}

interface N8nService {
  // Phase 1: チャット中継（n8nがレスポンス解析済みの構造化JSONを返す）
  chat(params: {
    currentSource: string;
    messages: ChatMessage[];
    userMessage: string;
  }): Promise<ChatResponse>;

  // Phase 2: テーブル生成
  generateTable(params: {
    source: string;
    modelType: ModelType;
  }): Promise<AnalysisTableData>;

  checkHealth(): Promise<boolean>;
}
```

- n8n Webhookへ HTTP POST
- チャット: n8nがLLM応答を解析し、構造化JSON（text + suggestedSource）を返却
- テーブル生成: 同様にJSON返却
- n8n側でプロンプト組み立て＋LLM呼び出し＋レスポンス解析をすべて実行
- フロントエンドはJSONを受け取って表示するだけ

### 6.3 TestCase Engine

```typescript
interface TestCaseEngine {
  // 状態遷移表 → Nスイッチカバレッジ
  generateNSwitchCases(
    table: StateTransitionTable,
    n: number
  ): TestCase[];

  // 因子水準表 → 組合せテスト
  generateCombinatorialCases(
    table: FactorLevelTable
  ): TestCase[];
}
```

- **純粋アルゴリズム** — 外部サービス呼び出しなし
- テーブルデータから即座に計算
- Nスイッチカバレッジ: グラフ探索によるパス列挙
- 組合せテスト: ペアワイズ等の組合せ手法

### 6.4 Export Service

```typescript
interface ExportService {
  exportAsJson(session: ReviewSession): void;
}
```

- ReviewSessionをJSON文字列化 → Blobダウンロード

## 7. n8nオーケストレーター設計

### 7.1 Webhookエンドポイント

| エンドポイント | Phase | 用途 |
|--------------|-------|------|
| `POST /webhook/modellogue-chat` | 1 | チャット中継（SSEレスポンス） |
| `POST /webhook/modellogue-analyze` | 2 | テーブル生成（JSONレスポンス） |
| `POST /webhook/modellogue-commit` | 3 | GitHub自動コミット |
| `POST /webhook/modellogue-event` | 3 | 業務フロー統合イベント |

### 7.2 チャット中継ワークフロー（Phase 1）

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
  "text": "この状態遷移図には初期状態からの...",
  "suggestedSource": "@startuml\n[*] --> Idle\n..."
}
```

**注**: `suggestedSource` はAIレスポンスに ` ```plantuml``` ` コードブロックが含まれる場合のみ。n8nワークフロー内で抽出する。

### 7.3 テーブル生成ワークフロー（Phase 2）

```
Webhook受信 → モデル種別に応じたプロンプト選択
→ Gemini API呼び出し → JSON整形 → レスポンス返却
```

**Webhook仕様**:

```
POST /webhook/modellogue-analyze
Content-Type: application/json

Request:
{
  "source": "...",
  "modelType": "state_diagram"
}

Response:
{
  "columns": ["Before State", "Event", "After State"],
  "rows": [
    ["Idle", "start", "Running"],
    ...
  ]
}
```

### 7.4 ワークフローのポータビリティ

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
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

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
│   ├── architecture.md
│   ├── Security_Design.md
│   └── traceability/
├── n8n/
│   └── workflows/
│       ├── chat-relay.json
│       └── table-generation.json      # Phase 2
├── docker-compose.yml
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Header/
│   │   ├── DiagramView/
│   │   │   └── SvgPreview.tsx
│   │   ├── AnalysisPanel/
│   │   │   ├── AnalysisPanel.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── PlantUmlEditor.tsx
│   │   │   ├── AnalysisTable.tsx      # Phase 2
│   │   │   ├── TestCaseView.tsx       # Phase 2
│   │   │   └── EbnfView.tsx           # Phase 2
│   │   ├── ChatPanel/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── SourceDiffView.tsx
│   │   │   └── ChatInput.tsx
│   │   ├── StatusBar/
│   │   └── MainLayout.tsx
│   ├── services/
│   │   ├── plantUmlService.ts
│   │   ├── n8nService.ts
│   │   └── exportService.ts
│   ├── engines/                        # 純粋アルゴリズム
│   │   ├── testCaseEngine.ts           # Phase 2
│   │   └── modelTypeDetector.ts        # Phase 2
│   ├── stores/
│   │   ├── sessionStore.ts
│   │   ├── chatStore.ts
│   │   ├── analysisStore.ts            # Phase 2
│   │   └── uiStore.ts
│   ├── grammars/                       # EBNF静的定義（Phase 2）
│   │   ├── stateDiagram.ebnf
│   │   └── mindmap.ebnf
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── en.json
│   │   └── ja.json
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       └── plantumlEncoder.ts
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

## 11. プロトタイプ検証計画（Walking Skeleton）

本番実装の前に、アーキテクチャの前提（外部サービス接続）を検証するプロトタイプを `Prototype/` に作成する。

### 11.1 検証目的

| # | 検証対象 | 成功条件 |
|---|---------|---------|
| 1 | PlantUML Server → SVG | 例題ソースを送信し、SVG画像が返る |
| 2 | n8n → Gemini チャット | Chat Trigger経由でGeminiが応答する |
| 3 | n8n レスポンス構造化 | AIレスポンスから構造化JSON（text + suggestedSource）が返る |
| 4 | UIレイアウト基本形 | SVG + ダミーテーブル + チャットが1画面に収まる |

### 11.2 プロトタイプ構成

```
Prototype/
├── index.html              # 1枚のHTML（SVG表示 + ダミーテーブル + n8nチャットウィジェット）
└── example.puml            # 例題PlantUMLソース（状態遷移図）
```

### 11.3 アプローチ

- **チャット**: n8nの `@n8n/chat` ウィジェットを埋め込み。カスタムコード不要。
- **SVG表示**: PlantUML Serverへ直接HTTPリクエスト（エンコード済みURL）。
- **テーブル**: ハードコードのダミーデータ。LLM連携はプロトタイプ後。
- **自前コード**: HTML/CSSのみ。React/TypeScriptはまだ使わない。

### 11.4 検証ステップ

1. `docker compose up -d` — PlantUML Server + n8n 起動
2. PlantUML Server 疎通確認（curl / ブラウザ）
3. n8n UI でワークフロー構築（Chat Trigger + Gemini）
4. `Prototype/index.html` をブラウザで開いて統合確認

環境構築の詳細手順は [`Doc/setup_guide.md`](./setup_guide.md) を参照。

## 12. Phase別の進化パス

```
Phase 1 (MVP) — コアレビュー基盤
├── DiagramView: SVGプレビュー（パン/ズーム）
├── AnalysisPanel: Source タブのみ（PlantUMLエディタ）
├── ChatPanel: n8n経由AI対話 + 修正提案の適用/Undo
├── StatusBar: PlantUML Server / n8n 接続状態
└── Export: セッションJSONエクスポート

Phase 2 (Analytical Review) — モデル解析＋インタラクティブ
├── AnalysisPanel: Table / TestCases / EBNF タブ追加
├── テーブル生成: n8n/LLMに委譲
├── テストケース: フロントエンド内アルゴリズム計算
├── 双方向ハイライト: 図 ↔ テーブル
├── React Flow: 要素選択・コメント付与
└── モデル種別自動検出

Phase 3 (Enterprise) — コラボレーション＋業務フロー
├── n8n経由 Slack/Teams/Discord フィードバック収集
├── n8n経由 GitHub自動コミット（レビュー証跡）
└── n8n経由 業務フロー統合
```

## 12. 判断記録（ADR）

### ADR-001: フロントエンドは純粋なUI

- **決定**: SPAは表示と接続のみ。秘密情報を持たない。
- **理由**: オープンソース + セルフホスト前提。Volatile Canvas思想。

### ADR-002: n8nをPhase 1からオーケストレーターとして導入

- **決定**: n8nがAI中継・テーブル生成・外部連携を一手に担う
- **理由**: アーキテクチャの一貫性。ワークフロー追加でPhase 2/3に拡張。
- **トレードオフ**: Docker環境必要だが、PlantUML Serverと同様。

### ADR-003: テーブル生成はLLM委譲、テストケースはアルゴリズム

- **決定**: PlantUMLソース → テーブル変換はn8n/LLMに委譲。テーブル → テストケース変換はフロントエンドのアルゴリズムで実行。
- **理由**:
  - テーブル生成: PlantUML構文の完全パーサを自前で実装するのは過剰。LLMに構造化データ抽出を委譲する方がシンプルで拡張性が高い。
  - テストケース: Nスイッチカバレッジ等は明確なアルゴリズム。LLMは不要。即座に計算可能。

### ADR-004: EBNFはモデル種別ごとの静的定義

- **決定**: EBNF文法はフロントエンドに静的ファイルとして持つ
- **理由**: 文法定義は変更頻度が低く、LLM生成は不安定。静的定義が最も信頼性が高い。

### ADR-005: AIレスポンスの解析はn8n側で行う

- **決定**: LLMレスポンスからのPlantUMLコードブロック抽出はn8nワークフロー内で実行し、フロントエンドには構造化JSON（text + suggestedSource）を返す。
- **理由**:
  - フロントエンドに `parseAiResponse` のようなパーサを持つ必要がなくなる
  - n8nワークフロー内でレスポンス整形を完結させることで、フロントエンドは受け取ったJSONを表示するだけになる
  - 「持たないアーキテクチャ」の一貫性：フロントエンドはUI表示に専念
