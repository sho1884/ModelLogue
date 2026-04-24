# Rejected sample corpus / EBNF 違反サンプル集

[../processDiagram.ebnf](../../processDiagram.ebnf) v1.1 が **拒否すべき** 構文を集めたディレクトリ。実装時に parser の「拒否側 fixture」として再利用する。

**重要**: ここに置いたサンプルの多くは、PlantUML Server 自体は受理する（`while` や `elseif`、`detach` は PlantUML ネイティブ構文）。レビュー向けサブセット (§3.15) の観点で我々が**意図的に拒否**する構文をまとめたもの。したがって `.svg` は置かない（描画を期待する場面ではない）。

## 一覧

| # | ファイル | 拒否する構文 | 書き換え例 |
|---|---|---|---|
| 01 | [01-nested-fork.puml](./01-nested-fork.puml) | `fork` の中にさらに `fork` | 単一 fork のブランチ数を増やすか、内側の並行部分を別サブプロセス化 |
| 02 | [02-nested-partition.puml](./02-nested-partition.puml) | `partition` の中にさらに `partition` | 同階層の兄弟 partition に平坦化、または内側を別セッションの別図へ |
| 03 | [03-while-loop.puml](./03-while-loop.puml) | `while (…) is (…) endwhile` | `if (まだ残あり?) then (yes) :処理; else (no) stop endif` のような明示的な出口を持つ分岐に、または自由記述の note に |
| 04 | [04-repeat-loop.puml](./04-repeat-loop.puml) | `repeat` / `repeat while` | 同 03 |
| 05 | [05-elseif.puml](./05-elseif.puml) | `elseif` / `else if` 多方分岐 | ネストした `if`（§3.15 の分岐ネスト規則）に書き換え |
| 06 | [06-detach.puml](./06-detach.puml) | `detach` — 合流なしで枝を切る | 明示的な `stop` で終端、または分離プロセスとして別図に |
| 07 | [07-kill.puml](./07-kill.puml) | `kill` — 異常終了 | `:中断;<<error>>` の後 `stop`（Events タブに error として surface する） |
| 08 | [08-legacy-syntax.puml](./08-legacy-syntax.puml) | 旧 activity 構文（`(*) --> :..;`） | 新 subset の `start / :...; / stop` 形 |
| 09 | [09-multiple-starts.puml](./09-multiple-starts.puml) | `start` を 2 回以上 | 単一 `start` の直後に分岐で起動条件を表現、または本当に別プロセスなら別図に |
| 10 | [10-arrow-label-no-successor.puml](./10-arrow-label-no-successor.puml) | `-> label;` に続くノードが存在しない | ラベルの位置を次ノードがある場所へ移す、または不要なら削除 |
| 11 | [11-start-in-fork-branch.puml](./11-start-in-fork-branch.puml) | fork ブランチの中に `start` | 内側の `start` を削除、または内側を partition もしくは別図に |

## 使い方（parser 実装時）

1. `parse(source)` がこれら各ファイルに対して **`errors` 配列を返し `model === null`** になることを unit test で検証
2. エラーメッセージは行番号付き、**書き換え例を示唆**する文面にする（例: `elseif is not supported at line 5; rewrite as nested if-else`）
3. ADR-009 の state-machine parser と同じ原則（guardrail は明確なエラーで導く）

## 将来の追加候補

- BPMN 特有構文の紛れ込み（pool / lane 構文違い、`message flow`、`data store` ノード等）— 今は PlantUML activity でそもそも書けないので優先度低
- `note` の中に `外部:` のような誤綴り（ハーフ角の `外部:` などを許容すべきか）— これはパーサ仕様として「受理するが Externals タブに surface しない」方針でよさそう。rejected ではなく accept-but-ignore のケース
