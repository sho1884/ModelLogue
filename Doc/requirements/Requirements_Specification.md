# ModelLogue Requirements Specification / ModelLogue 要求仕様書

| Item / 項目 | Content / 内容 |
|------|---------|
| Document / 文書 | ModelLogue Requirements Specification / ModelLogue 要求仕様書 |
| Version / バージョン | 7.2 (planned / 承認済・未実装) |
| Created / 作成日 | 2026-04-08 |
| Last Updated / 最終更新 | 2026-04-15 |
| Status / 状態 | v7.2 planned: lock-on-successful-parse, Undo+Redo on diagram toolbar, save-dialog contents checklist, empty-state guide, Open-saved-review accepts saved JSON, per-artifact Copy/Save (source as .puml, matrices as CSV/TSV), UI in plain English. v7.1 = implemented baseline. |

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
| UR-002 | Refer to the PlantUML source of the current model (read-only) / 現在のモデルのソースを参照する（読み取り専用） | High / 高 |
| UR-003 | View state transition table / 状態遷移表を見る | High / 高 |
| UR-004 | Place markers on the diagram / 図にマーカーを配置する | High / 高 |
| UR-005 | Discuss the model with AI / AIとモデルについて対話する | High / 高 |
| UR-006 | Apply AI suggestions (judged via visual before/after) / モデル図 before/after で提案を判断して適用する | Medium / 中 |
| UR-007 | Save the review evidence and lift individual artifacts / レビュー証跡を保存し個別成果物を取り出す | Medium / 中 |
| UR-008 | Obtain PlantUML subset grammar (download) / PlantUMLサブセット文法を取得（DL） | Low / 低 |
| UR-009 | Receive an initial model (+ optional requirements text) / 初版モデル（＋任意で要求仕様断片）を受け取る | High / 高 |
| UR-010 | Close the review session with an outcome / 結末を付けてレビューセッションを終了する | Medium / 中 |
| UR-011 | Convert between state machine source and state transition table / 状態マシンソースと状態遷移表を相互変換する | Medium / 中 |
| UR-012 | Refer to the target requirements text alongside the model / モデルと並べて要求仕様文を参照する | Medium / 中 |
| UR-013 | Review N-switch coverage test cases derived from the current model / 現在のモデルから導かれる N-switch カバレッジ用テストケースをレビューする | Medium / 中 |
| UR-014 | Review a requirement diagram / 要求図をレビューする **(v7.5 planned)** | High / 高 |

> **Note 1**: UR-009とUR-010の前後（初版生成手段、終了後フィードバック先）はn8nワークフローで現場ごとに構成する。ModelLogue本体は入出力の境界に専念する。詳細は [ADR-008](../adr/ADR-008-scope-boundary-with-surrounding-workflow.yaml) を参照。
>
> **Note 2**: UR-011の変換器は、ModelLogue本体ではなく、同一リポジトリ内の補助サービスとして実装する。CI/CDパイプラインからも直接呼び出せる。詳細は [ADR-010](../adr/ADR-010-external-services-for-heavy-or-domain-specific-work.yaml) と [ADR-011](../adr/ADR-011-strict-formats-and-deterministic-conversion.yaml) を参照。
>
> **Note 3**: UR-001 と UR-014 は同じ「ソフトウェアモデルをレビューする」というタスク形を持つ。モデル型（状態遷移図／要求図）ごとに編集・表示・解析の細部が異なるため、ModelLogue は **モデル型プラグイン構造** で両方を一つのアプリで扱う（[ADR-012](../adr/ADR-012-model-type-plugin-architecture.yaml)）。3 型目以降（例：クラス図、シーケンス図）も同じ構造で追加できる。

---

## 3. System Requirements / システム要件

> Source / 出典: [system_requirements.yaml](./system_requirements.yaml)

> **モデル型のスコープ（v7.5〜）**: §3.1–§3.12 の SR の多くは当初、状態遷移図を暗黙の前提にしている。v7.5 で要求図が加わるのにあわせて、これらは「モデル型ごとの実装に差し替え可能」な形（[ADR-012](../adr/ADR-012-model-type-plugin-architecture.yaml)）に整理する。状態遷移図固有の SR は **(state-machine)** と明記、要求図固有の SR は §3.13 にまとめ、モデル型非依存の共通 SR はそのままとする。

### 3.1 Source Editing / ソース編集

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-001 | Display PlantUML source (read-only during review; editable in SEED phase until first successful parse) / ソースを表示。SEED 中は編集可、最初の構文成功でロック **(v7.2 planned)** | UR-002, UR-009 |
| SR-002 | Parse PlantUML subset into state machine model / PlantUMLサブセットを状態マシンモデルに解析する | UR-001, UR-002, UR-003, UR-009 |
| ~~SR-003~~ | ~~Serialize state machine model to PlantUML source~~ — **Removed**: unnecessary; Undo restores full-source snapshots. | — |

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
| SR-022 | Provide marker and grammar context to AI / マーカー情報とEBNF文法をAIコンテキストに渡す | UR-004, UR-005, UR-008 |

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
| SR-033 | Present AI-proposed modifications as a visual before/after model comparison / モデル図 before/after を並置 + 差分オーバーレイで提案を提示する **(v7.1 redefined)** | UR-006 |
| SR-034 | Apply proposed source modification / 提案されたソース修正を適用する | UR-006 |
| SR-035 | Undo and Redo applied source modifications (controls live on the diagram toolbar) / Undo/Redo（ダイアグラムツールバー上） **(v7.2)** | UR-006 |

### 3.5 Session Management / セッション管理

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-040 | Manage session state in browser memory / ブラウザメモリでセッション状態を管理する | UR-002, UR-005, UR-007, UR-010 |
| SR-041 | Save the review session as a JSON file (Save dialog enumerates contents) / セッションをJSONで保存（ダイアログに含有物リスト） **(v7.2)** | UR-007, UR-010 |

### 3.6 Grammar Access / 文法へのアクセス

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| ~~SR-050~~ | ~~Display PlantUML subset grammar (EBNF tab)~~ — **Removed in v7.1** (replaced by SR-081 download) | — |

### 3.7 Infrastructure / インフラ

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-060 | Check PlantUML Server health / PlantUML Serverの稼働状態を確認する | UR-001 |
| SR-061 | Check n8n connectivity / n8nの接続状態を確認する | UR-005 |

### 3.8 Requirements & Seeding / 要求仕様＆シード (v7.1)

| ID | Function / 機能 | Parent / 親 |
|----|----------------|-------------|
| SR-080 | Provide a Requirements tab (lock condition aligned with SR-001) / 要求仕様タブ（ロック条件を SR-001 と整合） **(v7.2)** | UR-009, UR-012 |
| SR-081 | Offer the PlantUML subset grammar as a downloadable file / EBNF文法をファイルダウンロードで提供 | UR-008 |
| SR-082 | Generate an initial model from the requirements text (chat shortcut) / 要求仕様から初版モデルを生成（チャット shortcut） | UR-009 |
| SR-083 | Open a previously saved review or an externally prepared starter (file import; accepts SeedBundle OR ReviewSession shape) / 保存済みレビューまたは外部シードを開く（両形式受理） **(v7.2)** | UR-007, UR-009 |

**設計意図**:

- 要求仕様は「このモデル分の**断片**」だけを扱う（目安 4000 字、上限 8000 字）。大きな要求仕様書の抽出は依然として ModelLogue の外で行う（ADR-008 境界維持）
- 要求仕様もソースも、レビュー中は**読み取り専用の参照**。レビューの本質は「モデル図を介した要求仕様のブラッシュアップ」だが、自然言語への反映は**最終モデル確定後に外部で**実施する
- モデル生成ボタン = 要求仕様を含むチャットメッセージを投げる shortcut。裏側は通常のチャットと同じで、意図は対話ログに残る
- 外部シードバンドル = URL クエリパラメータ or ファイル import で `{ requirementsText?, plantUmlSource? }` を受け取る。n8n や CI から投入できる正式 I/F

### 3.9 Model Diff / モデル差分 (v7.1)

| ID | Function / 機能 | Parent / 親 |
|----|----------------|-------------|
| SR-090 | Compute a model-level diff between two StateMachineModel values / モデルレベル差分を計算する | UR-006 |

SR-033（提案の視覚化）はこの SR-090 が返す差分データを使って、提案側 SVG に add(緑)/remove(赤)/change(橙) のオーバーレイを描く。

### 3.10 Artifact Export / 個別エクスポート (v7.2–v7.3)

| ID | Function / 機能 | Parent / 親 |
|----|----------------|-------------|
| SR-100 | Export the current PlantUML source from the Source tab (Copy / Save .puml) / Source タブから .puml をコピー／保存 | UR-007 |
| SR-101 | Export the state transition table as canonical CSV (plain-text clipboard + Save) while HTML clipboard retains the human-friendly matrix / プレーンテキスト・Save は正規 CSV、HTML クリップボードは人間向けマトリクスのまま | UR-007 |
| SR-102 | Export generated test cases from the Test cases tab (Copy / Save) / Test cases タブからテストケースをコピー／保存 | UR-013 |

### 3.10a Test Case Display / テストケース表示 (v7.4)

| ID | Function / 機能 | Parent / 親 |
|----|----------------|-------------|
| SR-103 | Display N-switch test cases in a dedicated Analysis-panel tab, updated reactively from the current model / 専用タブにN-switchテストケースを表示し、現在のモデルに連動してリアクティブに更新する | UR-013 |

**設計意図**:

- テストケース生成は補助サービス（[`tools/nswitch/`](../../tools/nswitch/)）の責務。ModelLogue 本体はその HTTP API (§9.2) を叩いて結果を並べるだけ。重い計算ロジックは本体に取り込まない（ADR-010）。
- タブ内での**リアクティブ更新**を最優先。パース成功時に SVG 取得と同じデバウンスで自動再計算する。ユーザーが N (0/1/2) を切り替えた時も即時反映。
- エラーは **in-place 表示**：サービスが落ちていても、パースエラーがあっても、タブ内に原因を出すだけで UI 全体は動き続ける。

**設計意図**:

- **Save & finish JSON (SR-041)** は「レビュー証跡を一括で渡す/保管する」用途。中身はチェックリストでダイアログに明示
- **個別エクスポート (SR-100/101)** は「成果物を**他のツールで使う**」用途（PlantUML をドキュメントへ、表を Excel/他ツールへ、テストを CI へ）
- 役割が混ざらないように、エクスポート系は **2 系統明確に分離**する
- SR-101 の CSV は [`tools/nswitch/Requirements_Specification.md`](../../tools/nswitch/Requirements_Specification.md) §4.2 の**正規 state-transition-table CSV** を採用し、GUI ↔ CLI ↔ VCS でラウンドトリップ可能とする（v7.3 で反映予定）。画面上のマトリクス表示（SR-020）はプレゼンテーションとして独立し、今の見た目を維持する。

### 3.11 Deferred & Removed SRs / 未実装・削除SR一覧

`system_requirements.yaml` の `status` フィールドで機械可読に管理している。`planned` は v7.1 で承認済だが未実装、`deferred` は現時点で見送り、`removed` は廃止。

**Removed / 削除**:

| ID | Function / 機能 | Reason / 理由 |
|----|----------------|---------------|
| SR-003 | Serialize state machine model to PlantUML source | Undoは sourceHistory の全文スナップショット復元で実装、モデル→ソースの往復変換は不要 |
| SR-050 | Display PlantUML subset grammar (EBNF tab) | v7.1 で廃止。SR-081（ダウンロード）で代替 |

**Deferred / 見送り**:

| 項目 | Reason / 理由 |
|------|---------------|
| i18n（UR外・横断） | Phase 1 では UI 文字列直書きで運用。3言語目の追加、または言語トグルが必要になった時点で導入 |

> planned SR は `system_requirements.yaml` を仕様の契約として扱い、コードより先に確定させる（ドキュメント・ファースト）。実装着手前にこの仕様書と YAML を必ず見直す。

### 3.12 UI Layout / UI構成

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-070 | Render the diagram as primary view, with an empty-state guide when no model exists / プライマリビュー＋モデル未投入時のエンプティステート **(v7.2)** | UR-001, UR-014 |
| SR-071 | Render resizable analysis panel with tabs defined by the active model type (common: Requirements / Source; per-type: S×E / S×S / Test cases for state machine, Traceability / Orphans for requirement diagram) / アクティブなモデル型が定義する解析パネル・タブセットを表示（共通は要求仕様・ソース、型固有は状態遷移図なら S×E / S×S / テストケース、要求図ならトレーサビリティ／孤立要求）**(v7.5 tab set — ADR-012)** | UR-002, UR-003, UR-012, UR-013, UR-014 |
| SR-072 | Render chat panel with ProposalView (no longer hosts Undo — relocated per SR-035) / チャットパネル + 提案ビュー（Undo は移設） **(v7.2)** | UR-005, UR-006 |
| SR-073 | Select model type at session seed (one-way, fixed for the session lifetime) / セッションの seed 時にモデル型を選択（セッション期間中は不変） **(v7.5 planned)** | UR-009, UR-014 |

**Screen Layout / 画面構成 (v7.5)**:

セッションで選択中の**モデル型**（状態遷移図 / 要求図）によって解析パネルのタブセットが変わる。SEED フェーズではヘッダの右に **Model type** セレクタが出て、REVIEW 以降は固定表示（読み取り専用）。

状態遷移図セッション:

```
┌── Header ──────────────────────────────────────────────────────────────┐
│  ModelLogue  <session>  [Model: State machine ▾]  [Save & finish…]    │
│                                                 [Open saved review…]  │
├──────────────────────────────────────────────────────────┬────────────┤
│  Diagram View                                            │  Chat       │
│   …                                                      │   …         │
├── drag to resize ────────────────────────────────────────┤             │
│  Analysis Panel  [Requirements|Source|S×E|S×S|Test cases]│  input      │
└──────────────────────────────────────────────────────────┴────────────┘
```

要求図セッション:

```
┌── Header ──────────────────────────────────────────────────────────────┐
│  ModelLogue  <session>  [Model: Requirement ▾]    [Save & finish…]    │
├──────────────────────────────────────────────────────────┬────────────┤
│  Diagram View                                            │  Chat       │
│   …                                                      │   …         │
├── drag to resize ────────────────────────────────────────┤             │
│  Analysis Panel  [Requirements|Source|Traceability|Orphans]│  input    │
└──────────────────────────────────────────────────────────┴────────────┘
```

Notes:
- Undo / Redo live on the diagram toolbar (SR-035) — they affect the model, not the chat
- Empty-state guide replaces the diagram pane until a parseable model exists (SR-070)
- Source tab shows **Copy** / **Save .puml** actions (SR-100); each matrix tab shows **Copy** / **Save .csv** (SR-101 — v7.3 は正規 CSV 形式で保存)
- Test cases tab shows N selector (0/1/2) and a reactive test list fed by the nswitch HTTP API (SR-103, v7.4)
- ProposalView: 提案があるメッセージ内で、**現モデル SVG（左） / 提案モデル SVG（右）** を並置。提案側には SR-090 の差分に基づく緑/赤/橙オーバーレイを重ねる。下には提案ソースの折りたたみ表示と Apply ボタン。⛶ Open larger comparison でフルスクリーンモーダルへ。

### 3.13 Requirement Diagram Support / 要求図対応 (v7.5)

状態遷移図に続く 2 つ目のモデル型として、SysML 風の**要求図**をサポートする。PlantUML には要求図が native 実装されていないため、コミュニティで広く使われる `!procedure` マクロ + class 図ステレオタイプ形式を採用し、**そのマクロ呼び出し行自体を ModelLogue の要求図 DSL の一級構文**として扱う（詳細は [`src/grammars/requirementDiagram.ebnf`](../../src/grammars/requirementDiagram.ebnf)）。

#### 3.13.1 サポートする構文

| 種別 | マクロ | PlantUML への展開 | 意味 |
|---|---|---|---|
| 要求 | `$req(id, name [, text])` | `class` + `<<requirement>>` | 汎用要求 |
| 機能要求 | `$fReq(id, name [, text])` | `class` + `<<functionalRequirement>>` | 機能要求 |
| 非機能要求 | `$nfReq(id, name [, text])` | `class` + `<<Non-functionalRequirement>>` | 非機能要求（薄緑） |
| 設計制約 | `$dConstraint(id, name [, text])` | `class` + `<<designConstraint>>` | 設計制約（薄青） |
| 包含 | `$contain(parent, child)` | `+--` | 階層関係（composition） |
| 派生 | `$derive(supplier, client)` | `<.. : <<deriveReqt>>` | client は supplier から派生 |
| 詳細化 | `$refine(client, element)` | `<.. : <<refine>>` | element は client を詳細化 |
| 充足 | `$satisfy(req, design)` | `<.. : <<satisfy>>` | design は req を充足 |
| 検証 | `$verify(req, test)` | `<.. : <<verify>>` | test は req を検証 |
| トレース | `$trace(a, b)` | `<.. : <<trace>>` | 汎用追跡関係 |
| コピー | `$copy(original, copy)` | `<.. : <<copy>>` | copy は original のコピー |

**グルーピング**: `package "…" <<Frame>> { … }` で要求を階層的にまとめる。

#### 3.13.2 サポートしない構文

- 素の class 宣言（`class Foo <<requirement>> { … }`）: `$req` 等を経由すること
- 素の関係記法（`A --> B`, `A <.. B`）: `$derive` 等を経由すること
- `requirement` や `interface` などの PlantUML キーワード: class 系ステレオタイプを通じて表現する
- entry/exit point、orthogonal region、その他状態遷移図固有の構文

#### 3.13.3 preamble の自動注入

PlantUML Server でそのまま描画するためには `!procedure $fReq …` 等の定義が必要。ModelLogue はこの preamble を **描画時に自動注入**し、編集バッファには本質部分（`$fReq(…)` 呼び出しと関係）だけを見せる（SR-115）。保存 (`Save .puml`) 時は preamble を付けた自己完結形式で書き出し、読み込み時に preamble が含まれていれば尊重しつつ本質部分だけ抽出してバッファに展開する。

#### 3.13.4 新設 SR

| ID | Function / 機能 | Parent / 親 |
|----|----------|--------|
| SR-110 | Parse requirement-diagram subset into RequirementModel / 要求図サブセットを RequirementModel に解析する **(v7.5 planned)** | UR-014 |
| SR-111 | Generate traceability matrix (requirement × requirement by relation kind) / トレーサビリティマトリクス（要求 × 要求、関係種別）を生成する **(v7.5 planned)** | UR-014 |
| SR-112 | Identify orphan requirements (no incoming trace / no outgoing trace) / 孤立要求を抽出する（incoming/outgoing のない要求） **(v7.5 planned)** | UR-014 |
| SR-115 | Auto-inject `!procedure` preamble when rendering, strip on display, round-trip on save / 描画時に preamble を自動注入、表示時は除去、保存時は往復する **(v7.5 planned)** | UR-014 |

#### 3.13.5 既存 SR への影響

要求図の追加にあたって影響する既存 SR を以下に整理（詳細は [ADR-012](../adr/ADR-012-model-type-plugin-architecture.yaml)）：

- **SR-002** (PlantUML subset parse): 状態遷移図専用として残し、要求図は SR-110 が担当
- **SR-020 / SR-021** (State×Event / State×State matrix): 状態遷移図専用として明記
- **SR-071** (Analysis panel tabs): タブセットが**アクティブなモデル型に従う**設計に変更
- **SR-082** (AI initial model generation): プロンプトがモデル型ごとに分岐
- **SR-090** (Model diff): 型ごとに diff 実装が異なる
- **SR-103** (Test cases tab): 状態遷移図専用として明記

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
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  plantUmlSource: string;
  requirementsText: string; // v7.1: short, scoped requirements fragment (SR-080)
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
| Input | JSON: `currentSource` (PlantUML), `history` (prior turns), `userMessage`, `markerContext` (human-readable marker + coordinate summary), `grammarSpec` (EBNF of the supported subset) |
| Output | JSON: `text` (AI reply), optional `suggestedSource` (PlantUML extracted from a ```plantuml code block). Phase 1 は非ストリーミング |
| Note | n8n calls Gemini API; API key managed on n8n side. Phase 1 は ```plantuml ブロック抽出をフロントエンド側で実施（ADR-005 Phase 2 でn8n側に移設予定） |

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
