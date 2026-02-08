# ModelLogue アーキテクチャ設計書

**バージョン**: 1.1
**作成日**: 2026-02-08
**ステータス**: ドラフト

---

## 1. アーキテクチャ概要

ModelLogueは「持たないアーキテクチャ」を徹底する。フロントエンドSPAは純粋なUIであり、秘密情報を一切持たない。
AIとの対話やAPI連携はすべて**n8n（オーケストレーター）**が担い、ユーザーは自分のn8nインスタンスにAPIキーを設定する。

```
┌────────────────────────────────────────────────────────┐
│               ブラウザ（SPA — 純粋なUI）                  │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │ エディタ  │  │ プレビュー │  │ AIチャットパネル       │ │
│  │ パネル   │  │ パネル    │  │ （最低限のチャット中継） │ │
│  └────┬────┘  └─────┬────┘  └──────────┬────────────┘ │
│       │              │                  │               │
│  ┌────┴──────────────┴──────────────────┴───────────┐  │
│  │            ステート管理 (Zustand)                   │  │
│  └────┬──────────────┬──────────────────┬───────────┘  │
│       │              │                  │               │
│  ┌────┴────┐  ┌──────┴──────┐  ┌───────┴───────────┐  │
│  │PlantUML │  │ n8n         │  │ Export            │  │
│  │Service  │  │ Service     │  │ Service           │  │
│  └────┬────┘  └──────┬──────┘  └───────┬───────────┘  │
└───────┼──────────────┼─────────────────┼───────────────┘
        │              │                 │
        ▼              ▼                 ▼
  ┌──────────┐  ┌──────────────────┐  ┌──────────┐
  │ PlantUML │  │  n8n             │  │ ファイル   │
  │ Server   │  │  (Docker)        │  │ ダウンロード│
  │ (Docker) │  │                  │  └──────────┘
  └──────────┘  │  ┌────────────┐  │
                │  │ Gemini API │  │
                │  │ (中継)     │  │
                │  ├────────────┤  │
                │  │ Slack/     │  │
                │  │ Teams/     │  │
                │  │ Discord    │  │
                │  │ (任意連携)  │  │
                │  ├────────────┤  │
                │  │ GitHub     │  │
                │  │ (Phase 3)  │  │
                │  └────────────┘  │
                └──────────────────┘
```

## 2. 設計原則

### 2.1 フロントエンドは純粋なUI

- バックエンドを持たず、秘密情報（APIキー等）は一切フロントエンドに置かない
- セッションデータはブラウザのメモリ上に保持（Volatile Canvas思想）
- 永続化はエクスポート機能（Phase 1）またはGitHub連携（Phase 3）で対応

### 2.2 n8nがオーケストレーター

- AIチャットの中継、外部サービス連携はすべてn8nが担う
- APIキーはn8n側で管理し、フロントエンドには露出しない
- ユーザーが対話アプリ（Slack/Teams/Discord等）を使う場合、n8nがその橋渡しをする
- 対話アプリを使わないユーザーには、n8n経由で最低限のチャット中継を提供

### 2.3 疎結合

- 各外部サービスへのアクセスはService層で抽象化する
- サービスのモック化が容易な設計とし、テスタビリティを確保
- 外部サービスの差し替え（例: PlantUML → Mermaid、Gemini → 別のLLM）に対応可能

### 2.4 オープンソース＋セルフホスト

- ModelLogueはMIT Licenseで公開
- ユーザーは自身の環境にセルフホスト可能
- 各ユーザーが自分のn8nインスタンスに自分のAPIキーを設定する

## 3. コンポーネント設計

### 3.1 全体のコンポーネントツリー（Phase 1）

```
App
├── Header
│   ├── Logo
│   ├── SessionName
│   └── ExportButton
├── MainLayout（3ペインレイアウト）
│   ├── EditorPanel
│   │   └── PlantUmlEditor（CodeMirror）
│   ├── PreviewPanel
│   │   └── SvgPreview（パン/ズーム対応）
│   └── ChatPanel
│       ├── MessageList
│       │   ├── UserMessage
│       │   └── AssistantMessage
│       │       └── SourceDiffView（修正提案時）
│       │           └── ApplyButton
│       └── ChatInput
└── StatusBar
    ├── PlantUmlServerStatus
    ├── N8nStatus
    └── AiStatus
```

### 3.2 各コンポーネントの責務

#### App
- アプリケーション全体のルートコンポーネント
- グローバルなレイアウトとエラーバウンダリを提供

#### Header
- セッション名の表示・編集
- エクスポート機能の起動

#### EditorPanel
- PlantUMLソースコードの編集UI
- シンタックスハイライト（CodeMirror）
- ソース変更時にステートを更新

#### PreviewPanel
- PlantUML ServerからSVGを取得して表示
- パン・ズーム操作（react-zoom-pan-pinch等）
- ソース変更時にデバウンス付きで再レンダリング

#### ChatPanel
- AI対話のメッセージ表示と入力
- n8n経由でGemini APIへチャットを中継
- AIの修正提案の差分表示と適用ボタン

#### StatusBar
- PlantUML Serverの接続状態
- n8nの接続状態
- AI応答状態（接続中、応答待ち等）

## 4. ステート管理

Zustandを使用し、シンプルなストア設計とする。

### 4.1 ストア構造

```typescript
// Session store
interface SessionStore {
  sessionId: string;
  sessionName: string;
  createdAt: string;

  currentSource: string;
  sourceHistory: SourceSnapshot[];

  updateSource: (source: string, triggeredBy: string) => void;
  undoSource: () => void;
  setSessionName: (name: string) => void;
  exportSession: () => ReviewSession;
}

// Chat store
interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;

  sendMessage: (content: string) => Promise<void>;
  applyProposal: (messageId: string) => void;
  clearMessages: () => void;
}

// UI store
interface UiStore {
  panelSizes: { editor: number; preview: number; chat: number };
  theme: 'light' | 'dark';

  plantUmlServerStatus: 'connected' | 'disconnected' | 'checking';
  n8nStatus: 'connected' | 'disconnected' | 'checking';
  aiStatus: 'ready' | 'loading' | 'error';

  setPanelSizes: (sizes: Partial<UiStore['panelSizes']>) => void;
  setTheme: (theme: UiStore['theme']) => void;
}
```

## 5. サービス層

### 5.1 PlantUML Service

```typescript
interface PlantUmlService {
  renderSvg(source: string): Promise<string>;
  checkHealth(): Promise<boolean>;
}
```

**実装詳細**:
- PlantUMLソースをDeflate圧縮 → Base64エンコードして、PlantUML ServerのREST APIを呼び出す
- エンコードにはplantuml-encoderライブラリを使用
- デバウンス: ソース変更後500ms待ってからリクエスト
- エラーハンドリング: サーバー接続不可時はステータスバーに通知

### 5.2 n8n Service

```typescript
interface N8nService {
  // Send chat message via n8n webhook, receive AI response
  chat(params: {
    currentSource: string;
    messages: ChatMessage[];
    userMessage: string;
  }): AsyncGenerator<string>;  // Streaming response

  // Check n8n connectivity
  checkHealth(): Promise<boolean>;
}
```

**実装詳細**:
- n8nのWebhookエンドポイントへHTTPリクエストを送信
- n8n側でGemini APIキーを保持し、AIへリクエストを中継
- ストリーミングレスポンス対応（SSE）
- n8n側のワークフローで、システムプロンプト・コンテキスト組み立て・API呼び出しを処理

**n8nワークフロー（Phase 1: チャット中継）**:
```
Webhook受信 → コンテキスト組み立て → Gemini API呼び出し → レスポンス中継
```

**システムプロンプト方針**:
```
You are an AI assistant that supports software design reviews.
For the PlantUML model diagram provided by the user, you offer improvement suggestions
from the following perspectives:
- Appropriateness of design patterns
- Separation of concerns
- Naming quality
- Diagram readability
When suggesting modifications, provide the complete PlantUML source code
in a ```plantuml``` code block.
```

### 5.3 Export Service

```typescript
interface ExportService {
  exportAsJson(session: ReviewSession): void;
}
```

**実装詳細**:
- `ReviewSession`オブジェクトをJSON文字列化
- BlobとダウンロードリンクでファイルDL

## 6. n8nオーケストレーター設計

### 6.1 役割

n8nはModelLogueエコシステム全体のオーケストレーターとして、以下を担う:

| Phase | 機能 |
|-------|------|
| Phase 1 | Gemini APIへのチャット中継（APIキー保護） |
| Phase 2 | Slack/Teams/Discord連携による非同期フィードバック収集 |
| Phase 3 | GitHub自動コミット、業務フロー統合 |

### 6.2 Phase 1 ワークフロー: チャット中継

```
┌─────────┐     ┌──────────────────┐     ┌────────────┐
│ Browser  │────▶│ n8n Webhook      │────▶│ Gemini API │
│ (SPA)   │     │                  │     │            │
│         │◀────│ Response relay   │◀────│            │
└─────────┘     └──────────────────┘     └────────────┘
```

**Webhook仕様**:

```
POST {n8n_base_url}/webhook/modellogue-chat
Content-Type: application/json

Request:
{
  "currentSource": "...",       // Current PlantUML source
  "messages": [...],            // Conversation history
  "userMessage": "..."          // New user message
}

Response:
text/event-stream (SSE) — Streaming AI response
```

### 6.3 Phase 2 ワークフロー: 非同期フィードバック

```
Slack/Teams/Discord → n8n → フィードバック集約 → ModelLogue通知
```

### 6.4 Phase 3 ワークフロー: GitHub連携

```
ModelLogue (承認) → n8n → GitHub API (コミット: ソース + 対話ログ)
```

### 6.5 n8n設定のポータビリティ

- n8nワークフローはJSON形式でエクスポート可能
- ModelLogueリポジトリに `n8n/workflows/` ディレクトリを設け、テンプレートを同梱
- セルフホストユーザーはワークフローをインポートし、自分のAPIキーを設定するだけで利用開始

## 7. 外部サービス連携

### 7.1 PlantUML Server

- **接続方式**: HTTP REST
- **デプロイ**: Docker (`plantuml/plantuml-server:jetty`)
- **ポート**: 8080
- **CORS**: 開発時はViteのプロキシ設定で対応

### 7.2 n8n

- **接続方式**: HTTP Webhook
- **デプロイ**: Docker (`docker.n8n.io/n8nio/n8n`)
- **ポート**: 5678
- **設定**: 環境変数でGemini APIキーを注入

### 7.3 Docker Compose構成（開発環境）

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

## 8. ディレクトリ構造（Phase 1）

```
ModelLogue/
├── CLAUDE.md
├── LICENSE                      # MIT License
├── Reference/
├── Doc/                         # Design documents
│   ├── requirements/            # Requirements (YAML + Markdown)
│   ├── architecture.md
│   ├── Security_Design.md
│   └── traceability/            # Traceability diagrams (Mermaid)
├── n8n/
│   └── workflows/               # n8n workflow templates (JSON)
│       └── chat-relay.json      # Phase 1: Gemini chat relay
├── Prototype/                   # Prototype code (isolated from production)
├── docker-compose.yml           # PlantUML Server + n8n
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Header/
│   │   │   ├── Header.tsx
│   │   │   ├── SessionName.tsx
│   │   │   └── ExportButton.tsx
│   │   ├── EditorPanel/
│   │   │   └── PlantUmlEditor.tsx
│   │   ├── PreviewPanel/
│   │   │   └── SvgPreview.tsx
│   │   ├── ChatPanel/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── UserMessage.tsx
│   │   │   ├── AssistantMessage.tsx
│   │   │   ├── SourceDiffView.tsx
│   │   │   └── ChatInput.tsx
│   │   ├── StatusBar/
│   │   │   └── StatusBar.tsx
│   │   └── MainLayout.tsx
│   ├── services/
│   │   ├── plantUmlService.ts
│   │   ├── n8nService.ts        # Replaces geminiService.ts
│   │   └── exportService.ts
│   ├── stores/
│   │   ├── sessionStore.ts
│   │   ├── chatStore.ts
│   │   └── uiStore.ts
│   ├── i18n/
│   │   ├── index.ts             # i18next initialization
│   │   ├── en.json              # English translations
│   │   └── ja.json              # Japanese translations
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       └── plantumlEncoder.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json                  # Vercel deployment config + security headers
└── .env.example                 # N8N_BASE_URL, PLANTUML_SERVER_URL
```

## 9. ビルド・開発環境

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

## 10. 主要ライブラリ

| ライブラリ | バージョン目安 | 用途 |
|-----------|-------------|------|
| react | ^19 | UIフレームワーク |
| react-dom | ^19 | DOM描画 |
| @xyflow/react | ^12 | React Flow (Phase 2) |
| zustand | ^5 | ステート管理 |
| @codemirror/lang-* | 最新 | コードエディタ |
| plantuml-encoder | ^1 | PlantUMLエンコード |
| react-zoom-pan-pinch | ^3 | SVGパン/ズーム |
| i18next | ^24 | 国際化フレームワーク |
| react-i18next | ^15 | React向けi18nextバインディング |

## 11. Phase別の進化パス

```
Phase 1 (MVP)
├── PlantUMLエディタ + SVGプレビュー
├── AI対話チャット（n8n経由でGemini中継）
├── 修正提案の適用・Undo
└── セッションJSON エクスポート

Phase 2 (Collaborative)  ← React Flow + 外部チャット連携
├── SVGプレビュー → React Flowインタラクティブ表示へ進化
├── 要素ポインティング・コメント機能
├── n8n経由でSlack/Teams/Discord連携
└── AI議論集約エンジン

Phase 3 (Enterprise)  ← GitHub統合 + 業務フロー
├── n8n経由でGitHub API自動コミット（レビュー証跡）
├── n8nワークフローによる業務フロー統合
├── マルチユーザー認証
└── レビューダッシュボード
```

## 12. 判断記録（ADR）

### ADR-001: フロントエンドは純粋なUI

- **決定**: フロントエンドSPAは純粋なUIとし、秘密情報を一切持たない
- **理由**: オープンソース＋セルフホスト前提。APIキー等はn8n側で管理する。Volatile Canvas思想との一貫性。

### ADR-002: n8nをPhase 1からオーケストレーターとして導入

- **決定**: 専用のAPIプロキシを作らず、n8nをPhase 1から導入してチャット中継を担わせる
- **理由**:
  - Phase 3で必要になるn8nを先行導入することで、アーキテクチャの一貫性を保つ
  - n8nはオープンソース（フェアコードライセンス）でセルフホスト可能
  - APIキーはn8n側で管理し、フロントエンドに露出しない
  - 将来のSlack/Teams/Discord/GitHub連携もn8nのワークフロー追加で対応可能
- **トレードオフ**: 開発環境でDocker上にn8nを立てる必要があるが、PlantUML Serverも同様にDockerで動かすため追加負担は小さい

### ADR-003: 対話アプリの選択はユーザーに委ねる

- **決定**: Slack/Teams/Discord等の対話アプリ連携は任意。ModelLogue内蔵のチャットUIは最低限の中継機能を提供
- **理由**: ユーザーの環境や好みに応じて柔軟に対応できるようにする。n8nが橋渡しを担うことで、どの対話アプリとも連携可能。
