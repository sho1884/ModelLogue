# Process diagram example corpus / プロセス図サンプル集

EBNF ([../processDiagram.ebnf](../processDiagram.ebnf) v1.1) で受理される
構文のカバレッジ確認用サンプル。v7.6 実装時にパーサのテストフィクスチャ
および AI プロンプトの用例として再利用する。

全サンプルは PlantUML Server (localhost:8080) で実際にレンダリング済み。
`.svg` は同ディレクトリに置いてある（コミット時点のレンダリング結果）。

## 実行方法

SVG を再生成するには：

```bash
for f in *.puml; do
  curl -s -H "Content-Type: text/plain; charset=utf-8" \
    -X POST --data-binary "@${f}" http://localhost:8080/svg/ \
    -o "${f%.puml}.svg"
done
```

**`charset=utf-8` は必須**。付けないと PlantUML Server は body を Latin-1
で解釈し、一部の kanji（「者」「担」「照」等）が PlantUML キーワードと
衝突して Syntax Error になる。`plantuml-encoder` 経由の encoded-URL
パス（SPA が使うルート）ではこの問題は発生しない（ASCII only）。

## サンプル一覧

| # | ファイル | 何をテストしているか | カバーする構文 |
|---|---|---|---|
| 01 | [01-linear.puml](./01-linear.puml) | 最小の線形フロー | `start` / `:task;` / `stop` / `title` / レーン 1 つ |
| 02 | [02-simple-branch.puml](./02-simple-branch.puml) | 承認／却下の 2 分岐 | `if (...) then (...) else (...) endif`、両分岐とも `stop` |
| 03 | [03-nested-branch.puml](./03-nested-branch.puml) | 条件の AND 組合せ | ネスト `if`、3 分岐への展開 |
| 04 | [04-parallel.puml](./04-parallel.puml) | 並行後処理 | `fork / fork again / end fork`（3 ブランチ）、合流後に後続処理 |
| 05 | [05-multi-lane.puml](./05-multi-lane.puml) | 3 アクター間の受け渡し | 3 レーンの切替、矢印ラベル（伝票）、分岐内レーン維持 |
| 06 | [06-partition-with-lanes.puml](./06-partition-with-lanes.puml) | 複数人協働サブプロセス | partition 内で `|Actor|` 切替。partition 枠がレーン境界をまたぐ |
| 07 | [07-subprocess.puml](./07-subprocess.puml) | サブプロセス単独（1 アクター） | partition の色タグ `#LightYellow` |
| 08 | [08-artifacts.puml](./08-artifacts.puml) | 伝票トレース | `-> 伝票名;` を分岐の yes / no 両方に配置、複数レーン |
| 09 | [09-events.puml](./09-events.puml) | タイムアウト／督促／エラー | `<<timer>>` / `<<message>>` / `<<error>>` ステレオタイプ、ネスト if |
| 10 | [10-complex-realistic.puml](./10-complex-realistic.puml) | E2E 想定フル盛り | 上記全要素の組合せ（20 ノード級）— レーン 5、partition + 内部レーン切替、ネスト if、fork + 内部レーン、伝票、message イベント |
| 11 | [11-external-references.puml](./11-external-references.puml) | 外部 IT システム / リポジトリの付箋注釈 | `note right ... **外部:** 名前 ... end note` パターン。人・組織は通常レーン、外部 IT 要素は付箋で表し、IT 要素間の順序関係を持たせない（SR-125 規約） |

## EBNF カバレッジ

現 EBNF v1.1 の主要構文はこの 10 例で概ね網羅：

- [x] `start` / `stop` / `end`
- [x] `:task;`（単純 / 日本語）
- [x] `:task;<<stereotype>>`（timer / message / error）
- [x] `if (cond) then (yes) ... else (no) ... endif`
- [x] ネスト `if`
- [x] `fork / fork again / end fork`（2 ブランチ／3 ブランチ）
- [x] `|Actor|` スイムレーン（単一／複数）
- [x] 分岐内レーン切替
- [x] `partition "名前" { ... }`
- [x] `partition #Color "名前" { ... }`
- [x] partition 内レーン切替（多人数協働サブプロセス）
- [x] `-> 伝票名;` 矢印ラベル（通常位置／分岐 yes 側／分岐 no 側）
- [x] `title`
- [x] `note right ... end note` / 単一行 note — 11 で本格使用、01-10 の accept-and-ignore 確認は parser unit test で
- [x] `**外部:** 名前` note 内規約（SR-125）— 11 で demonstrate

**未カバー（意図的 / 要検討）**:

- [ ] マルチライン `:task\n続き;` ラベル — EBNF では許可したが実例なし。実装時に parser unit test で別途担保予定
- [ ] `skinparam` / `header` / `footer` / `legend` / `!procedure` — accept-and-ignore の確認、実装時に別途テスト
- [x] 拒否すべきパターン（`while`、`elseif`、`detach`、`(*)` 等）— [`./rejected/`](./rejected/) に 11 件分離済み

## 実装時の利用想定

1. **parser unit test** — 各 `.puml` を食わせて ProcessModel を組み、期待値と比較
2. **AI プロンプト** — システムメッセージで 01-04 あたりを few-shot 例として提示
3. **scenarios タブの動作確認** — 09 / 10 の経路列挙結果を golden file として残す
4. **自動マーカーのスモークテスト** — 「01 を 02 に変更した際に分岐ノードが緑マークされる」等
