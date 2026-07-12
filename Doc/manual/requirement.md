# Requirement diagram / 要求図（Requirement）

← [Back to the manual top / マニュアルのトップに戻る](index.md)

A model type for reviewing requirements and their relationships. It expresses a SysML-style requirement diagram in a PlantUML subset DSL, and automatically generates a **traceability matrix** and a **list of orphan requirements (Orphans)**.

要求とその関係をレビューするためのモデル型です。SysML 風の要求図を PlantUML のサブセット DSL で表現し、
**トレーサビリティ（追跡）マトリクス** と **孤立要求（Orphans）の一覧** を自動生成します。

This page assumes the common operations (screen layout, chat, markers, saving, etc.). If you have not read it yet, read the [top page](index.md) first.

このページは共通操作（画面構成・チャット・マーカー・保存など）を前提にしています。
まだの場合は先に [トップページ](index.md) を読んでください。

---

## What you can do with this type / この型でできること

- Draw requirements (user requirements, functional requirements, non-functional requirements, design constraints) and the relationships between them / 要求（利用者要求・機能要求・非機能要求・設計制約）と、その間の関係を描く
- Get an overview of the **traceability** among requirements / 要求どうしの **トレーサビリティ** を俯瞰する
- Find **orphan requirements** that are not connected to any other requirement / どの要求ともつながっていない **孤立要求** を洗い出す

---

## Writing the source (supported subset) / ソースの書き方（対応サブセット）

Because PlantUML does not have a native requirement diagram, ModelLogue treats the **`!procedure` macro call form** as a first-class construct of the DSL. When you start a new session, a **preamble** that defines these macros (a definition block including `hide circle` and the like) is **automatically inserted** into the edit buffer. Leave the preamble as is (if you delete it, the source can no longer be rendered by the PlantUML Server as is).

PlantUML は要求図を標準では持たないため、ModelLogue は **`!procedure` マクロ呼び出し形式** を
DSL の一級構文として扱います。新しいセッションを始めると、これらのマクロを定義した **プリアンブル**
（`hide circle` などを含む定義ブロック）が編集バッファに **自動で挿入** されます。
プリアンブルはそのまま残してください（消すとそのままでは PlantUML Server で描画できなくなります）。

### Macros that declare requirements / 要求を宣言するマクロ

| Macro / マクロ | Meaning / 意味 |
|-------|------|
| `$req(id, name [, text])` | Requirement (generic) / 要求（一般） |
| `$fReq(id, name [, text])` | Functional requirement / 機能要求 |
| `$nfReq(id, name [, text])` | Non-functional requirement / 非機能要求 |
| `$dConstraint(id, name [, text])` | Design constraint / 設計制約 |

`text` is an optional supplementary description.

`text` は省略可能な補足説明です。

### Macros that declare relationships / 関係を宣言するマクロ

| Macro / マクロ | Meaning / 意味 |
|-------|------|
| `$contain(parent, child)` | Containment (the parent contains the child) / 包含（親が子を含む） |
| `$derive(supplier, client)` | Derive / 派生 |
| `$refine(client, element)` | Refine / 詳細化 |
| `$satisfy(req, design)` | Satisfy (the design satisfies the requirement) / 充足（設計が要求を満たす） |
| `$verify(req, test)` | Verify (the test confirms the requirement) / 検証（テストが要求を確認する） |
| `$trace(a, b)` | Trace (a generic association) / 追跡（一般的な関連） |
| `$copy(original, copy)` | Copy / 複製 |

### Example / 例

```plantuml
@startuml

' （プリアンブルはここに自動挿入されています）

$req(UR-001, "利用者はログインできる")
$fReq(SR-010, "資格情報を検証する")
$nfReq(SR-020, "応答は 1 秒以内")

$contain(UR-001, SR-010)
$satisfy(SR-010, UR-001)
@enduml
```

Not supported: bare `class` declarations or raw relationship arrows, direct use of the `requirement` keyword, and class-diagram structures other than requirements. For the exact syntax, the full text is given below under **“Grammar definition (EBNF)”**.

対応しないもの：素の `class` 宣言や生の関係矢印、`requirement` キーワードの直接利用、
要求以外のクラス図構造。正確な構文は、下記の **「文法定義（EBNF）」** に全文を載せています。

### Review state is expressed with PlantUML comments / レビュー状態は PlantUML コメントで表現

Review states such as “hide this requirement for now,” “treat this as deleted,” and “attach a note” are expressed not with dedicated macros but with **PlantUML comments** (`' @modellogue ...`). This way, the source can be passed directly to the PlantUML Server and still render as an ordinary requirement diagram.

「この要求は今は隠す」「これは削除扱い」「注記を付ける」といったレビュー上の状態は、
専用マクロではなく **PlantUML コメント**（`' @modellogue ...`）で表現されます。
これにより、ソースをそのまま PlantUML Server に渡しても普通の要求図として描画できます。

---

## Grammar definition (EBNF) / 文法定義（EBNF）

This is the **formal definition** of the syntax ModelLogue accepts for this model type. Any construct not listed here is rejected as a syntax error with a line number. The full text is reproduced below as is, so you can copy and use it.

このモデル型で ModelLogue が受け付ける構文の**正式な定義**です。ここに載っていない構文は、行番号付きの構文エラーとして拒否されます。全文は下記にそのまま掲載しているので、コピーして使えます。

**How to use**: Paste this definition block directly to the AI and tell it “generate PlantUML following this grammar,” and you are more likely to get output that stays within the subset. ModelLogue itself uses the same definition in its instructions to the AI.

**使い方**: この定義ブロックをそのまま AI に貼り付け、「この文法に従って PlantUML を生成して」と伝えると、サブセットから外れない出力を得やすくなります。ModelLogue 自身も、同じ定義を AI への指示に使っています。

```ebnf
(* ModelLogue Requirement Diagram Subset Grammar            *)
(* Version: 2.0                                             *)
(* Reference: ADR-012 (model-type framework),               *)
(*            ADR-013 (requirement-review scope boundary),  *)
(*            ADR-014 (soft-delete + reason preservation),  *)
(*            ADR-009 analogue (minimal subset principle)   *)
(*                                                          *)
(* Core principle (as of 2026-04-23): the DSL is a SUBSET    *)
(* of PlantUML. A source that is valid under this grammar    *)
(* must also be valid PlantUML when fed directly to the      *)
(* PlantUML Server without going through ModelLogue. The    *)
(* only "tool magic" is the `!procedure` preamble that       *)
(* defines the SysML-convention macros; the preamble lives   *)
(* INSIDE the edit buffer (seeded at session start), not     *)
(* injected at render time.                                  *)
(*                                                          *)
(* The macro names $req / $fReq / $nfReq / $dConstraint /    *)
(* $contain / $derive / $refine / $satisfy / $verify /       *)
(* $trace / $copy come from the community SysML-via-         *)
(* PlantUML convention and are defined by the preamble. No   *)
(* ModelLogue-specific macros are added beyond those.       *)
(*                                                          *)
(* In addition to the macro form, this grammar defines a     *)
(* semi-structured SEED form accepted in the Requirements    *)
(* tab at session seeding time (SR-110). Both forms coexist  *)
(* in the same file; the parser normalizes them into a       *)
(* single RequirementModel.                                  *)
(*                                                          *)
(* Review-state — hide / delete / note (ADR-014) — is        *)
(* expressed entirely in PlantUML COMMENTS so the source    *)
(* stays PlantUML-valid even without ModelLogue. See         *)
(* "Review-state comment directives" below.                  *)
(*                                                          *)
(* Scope note (ADR-013): satisfy / verify / trace relations  *)
(* are accepted at the grammar level so they don't disappear *)
(* between renders, but v7.5 analysis tabs treat them as     *)
(* "not requirement-to-requirement" and surface them only    *)
(* in the generic Traceability tab. Requirement-to-          *)
(* downstream (design / test) traceability is a separate     *)
(* review phase per ADR-013.                                 *)

(* ===== Top-level structure ===== *)

diagram          = "@startuml" , newline ,
                   { line , newline } ,
                   "@enduml" ;

line             = empty_line
                 | review_state_comment
                 | comment
                 | preamble_line
                 | package_block
                 | requirement_call
                 | relation_call
                 | seed_requirement_line
                 | seed_relation_line
                 | commented_declaration  (* for delete blocks *) ;

empty_line       = { whitespace } ;

comment          = "'" , { any_char } ;

(* ===== Preamble lines (tolerated, no semantic effect) ===== *)
(*                                                             *)
(* The user-side !procedure definitions render the macros at   *)
(* PlantUML Server time. We do not re-implement that expansion *)
(* — we parse the calls directly. Every other decorative line  *)
(* below is also skipped for analysis.                         *)

preamble_line    = procedure_block
                 | hide_directive
                 | show_directive
                 | skinparam_directive
                 | title_directive
                 | pragma_directive
                 | theme_directive
                 | note_block
                 | legend_block ;

procedure_block  = "!procedure" , { any_char | newline } , "!endprocedure" ;

hide_directive   = "hide" , whitespace , { any_char } ;
show_directive   = "show" , whitespace , { any_char } ;
skinparam_directive
                 = "skinparam" , whitespace , { any_char } ;
title_directive  = "title" , whitespace , { any_char } ;
pragma_directive = ( "!pragma" | "!theme" | "!include" | "!define" ) ,
                   whitespace , { any_char } ;
theme_directive  = "!theme" , whitespace , { any_char } ;
note_block       = "note" , { any_char | newline } , "end" , whitespace , "note" ;
legend_block     = "legend" , { any_char | newline } , "end" , whitespace , "legend" ;

(* ===== Package (requirement grouping) ===== *)

package_block    = package_head , newline ,
                   { package_body_line , newline } ,
                   "}" ;

package_head     = "package" , whitespace ,
                   '"' , package_label , '"' ,
                   [ whitespace , "<<" , stereotype_text , ">>" ] ,
                   whitespace , "{" ;

package_body_line
                 = empty_line
                 | comment
                 | requirement_call ;

(* Packages MAY be nested but nested containment is normalized *)
(* into the `parent` field of each requirement for the internal *)
(* model. Relations are always at top level, outside packages. *)

(* ===== Requirement declarations ===== *)
(*                                                             *)
(* Four flavors, mapping to the SysML stereotypes the user's   *)
(* existing macros produce:                                    *)
(*                                                             *)
(*   $req(id, name)              -> <<requirement>>            *)
(*   $req(id, name, text)        -> <<requirement>>            *)
(*   $fReq(id, name)             -> <<functionalRequirement>>  *)
(*   $fReq(id, name, text)                                     *)
(*   $nfReq(id, name)            -> <<Non-functionalRequirement>> *)
(*   $nfReq(id, name, text)                                    *)
(*   $dConstraint(id, name)      -> <<designConstraint>>       *)
(*   $dConstraint(id, name, text)                              *)
(*                                                             *)
(* All four share the same call shape; `text` is optional. *)

requirement_call = req_macro_name , "(" , arg , "," , arg , [ "," , arg ] , ")" ;

req_macro_name   = "$req"
                 | "$fReq"
                 | "$nfReq"
                 | "$dConstraint" ;

(* ===== Relationship declarations ===== *)
(*                                                             *)
(* All relations take exactly two id arguments. The argument   *)
(* order is fixed per macro to match the user-side !procedure   *)
(* definitions, so PlantUML Server renders the arrow the       *)
(* expected direction.                                         *)
(*                                                             *)
(*   $contain(parent, child)            parent +-- child       *)
(*   $derive(supplier, client)          supplier <.. client : <<deriveReqt>> *)
(*   $refine(client, namedElement)      client <.. namedElement : <<refine>>  *)
(*   $satisfy(req, design)              req <.. design : <<satisfy>>          *)
(*   $verify(req, test)                 req <.. test : <<verify>>             *)
(*   $trace(a, b)                       a <.. b : <<trace>>                   *)
(*   $copy(original, copy)              original <.. copy : <<copy>>          *)

relation_call    = relation_macro_name , "(" , arg , "," , arg , ")" ;

relation_macro_name
                 = "$contain"
                 | "$derive"
                 | "$refine"
                 | "$satisfy"
                 | "$verify"
                 | "$trace"
                 | "$copy" ;

(* ===== Review-state comment directives (ADR-014) ===== *)
(*                                                               *)
(* Hide / delete / note are expressed as PlantUML COMMENTS, so   *)
(* the source remains valid PlantUML when sent directly to the   *)
(* server without going through ModelLogue. PlantUML silently     *)
(* ignores the comments; ModelLogue's parser extracts the         *)
(* metadata to populate Requirement.hidden / deleted / note.      *)
(*                                                               *)
(*   ' @modellogue hide "id"                                      *)
(*       Mark id as hidden. The declaration stays UNCOMMENTED    *)
(*       in the source — PlantUML directly renders it; only      *)
(*       ModelLogue's render-time filter (SR-114) comments it    *)
(*       out when displaying the diagram.                         *)
(*                                                               *)
(*   ' @modellogue deleted "id" "reason"                          *)
(*       Mark id as deleted (review decision). The declaration    *)
(*       and all relations touching id are commented OUT in the   *)
(*       source itself, so PlantUML never renders them — with     *)
(*       or without ModelLogue. The marker line retains the       *)
(*       reason as evidence. Each suppressed relation carries an  *)
(*       inline tag `' ... ' @modellogue deleted-side "id"` so    *)
(*       Undelete can restore them.                               *)
(*                                                               *)
(*   ' @modellogue note "id" "text"                               *)
(*       Free-form annotation attached to id. Declaration stays   *)
(*       uncommented. Multiple notes append in source order.      *)
(*                                                               *)
(* The id in any directive MUST correspond to a requirement       *)
(* declared in the same source (via macro call or seed row). A    *)
(* directive for an unknown id is a parse error.                  *)

review_state_comment
                 = "'" , whitespace , "@modellogue" , whitespace ,
                   ( "hide" | "deleted" | "note" | "deleted-side" ) ,
                   { whitespace , '"' , arg_text , '"' } ;

commented_declaration
                 = "'" , whitespace , ( requirement_call | relation_call ) ,
                   [ whitespace , "'" , whitespace , "@modellogue" ,
                     whitespace , "deleted-side" , whitespace ,
                     '"' , arg_text , '"' ] ;

(* ===== SEED form (friendly input for Requirements tab paste) ===== *)
(*                                                                   *)
(* Accepts rows that look like a spreadsheet or a plain list, plus   *)
(* relation arrows on their own lines. The parser converts them into *)
(* macro-form output deterministically.                              *)
(*                                                                   *)
(* Requirement row:                                                  *)
(*   id, statement [, type [, text]]                                 *)
(*                                                                   *)
(* `type` is one of: func, functional, nfunc, nonfunc, non-func,     *)
(*                   non-functional, constraint, c, req              *)
(* Default type when omitted is `functional`.                        *)
(* Values are comma-separated; commas inside a quoted string are     *)
(* preserved.                                                        *)
(*                                                                   *)
(* Relation arrow:                                                   *)
(*   source_id --> target_id                        (default: derive)*)
(*   source_id --> target_id : Containment          (contain)        *)
(*   source_id --> target_id : Refine               (refine)         *)
(*   source_id --> target_id : Copy                 (copy)           *)
(*                                                                   *)
(* Arrow forms with SysML semantics outside requirement-to-          *)
(* requirement scope (satisfy / verify / trace) are accepted only    *)
(* via the macro form ($satisfy / $verify / $trace); seed-form       *)
(* arrows are restricted to the 4 r-to-r relations to keep the input *)
(* within v7.5's ADR-013 scope.                                      *)

seed_requirement_line
                 = seed_id , "," , whitespace_opt ,
                   seed_statement ,
                   [ "," , whitespace_opt , seed_type ] ,
                   [ "," , whitespace_opt , seed_text ] ,
                   [ "," , whitespace_opt , seed_hidden ] ,
                   [ "," , whitespace_opt , seed_deleted ] ,
                   [ "," , whitespace_opt , seed_note ] ;

(* Columns 5-7 match the CSV produced by SR-113 so a saved      *)
(* .csv round-trips as a valid seed input. Any of them may be    *)
(* omitted; missing columns default to empty (hidden=false,      *)
(* deleted=false, note=""). When deleted=Y, note MUST be non-    *)
(* empty (enforced by the parser, not the grammar).              *)

seed_id          = identifier ;
seed_statement   = { any_char_except_comma_or_quote } | '"' , arg_text , '"' ;
seed_type        = "func" | "functional"
                 | "nfunc" | "nonfunc" | "non-func" | "non-functional"
                 | "constraint" | "c"
                 | "req" | "requirement" ;
seed_text        = '"' , arg_text , '"' | { any_char_except_comma } ;
seed_hidden      = "" | "Y" | "y" ;
seed_deleted     = "" | "Y" | "y" ;
seed_note        = '"' , arg_text , '"' | { any_char_except_comma } ;

seed_relation_line
                 = identifier , whitespace_opt ,
                   "-->" , whitespace_opt ,
                   identifier ,
                   [ whitespace_opt , ":" , whitespace_opt , seed_relation_kind ] ;

seed_relation_kind
                 = "Containment" | "Contain" | "contain"
                 | "Refine" | "refine"
                 | "Copy" | "copy"
                 | "Derive" | "derive"
                 | "deriveReqt" ;

any_char_except_comma
                 = (* any character except , or newline *) ;
any_char_except_comma_or_quote
                 = (* any character except , " or newline *) ;

(* ===== Lexical tokens ===== *)

arg              = whitespace_opt , '"' , arg_text , '"' , whitespace_opt ;
arg_text         = { escaped_char | any_char_except_double_quote } ;
escaped_char     = "\" , any_char ;

(* Identifier used as the `as` alias AND as the key in relations. *)
(* Must be the bare identifier form PlantUML accepts (no spaces). *)

identifier       = letter , { letter | digit | "_" } ;

package_label    = { any_char_except_double_quote } ;
stereotype_text  = { any_char_except_gt } ;

letter           = "A" | "B" | ... | "Z" | "a" | "b" | ... | "z" | unicode_char ;
digit            = "0" | "1" | ... | "9" ;
unicode_char     = (* Hiragana, Katakana, Kanji, etc. *) ;
whitespace       = " " | "\t" ;
whitespace_opt   = { whitespace } ;
newline          = "\n" | "\r\n" ;
any_char         = (* any character except newline *) ;
any_char_except_double_quote
                 = (* any character except " *) ;
any_char_except_gt
                 = (* any character except > *) ;

(* ===== Explicitly NOT supported ===== *)
(*                                                             *)
(* Constructs that are rejected with a syntax error:           *)
(*                                                             *)
(*   - Raw class-diagram relations (  A --> B,  A <.. B , etc.) *)
(*       Use $derive / $refine / $satisfy / $verify / $trace.  *)
(*       Rationale: relations must go through a known macro so   *)
(*       the `kind` is unambiguous for analysis.               *)
(*                                                             *)
(*   - Inline class declarations (  class X <<requirement>> { … }) *)
(*       Use $req / $fReq / $nfReq / $dConstraint.             *)
(*                                                             *)
(*   - Interface, enum, abstract — any non-requirement class   *)
(*     diagram element.                                        *)
(*                                                             *)
(*   - Nested $contain forming a package-nesting hierarchy     *)
(*     is allowed (it is data, not grammar), but the internal *)
(*     model permits at most one level of package nesting.    *)
(*                                                             *)
(* Expansion surface (handled later):                          *)
(*                                                             *)
(*   - $useCase / $testCase / $designElement — stereotype tags  *)
(*     for external artifacts (satisfy/verify targets). The    *)
(*     current grammar allows any id string as a relation      *)
(*     endpoint, and leaves the external-artifact modeling to  *)
(*     a follow-up version.                                    *)
```

## Dialogue with the AI / AI との対話

In requirement diagrams, exchange with the AI is done via **CSV**. This is because the list of requirements is the substance, and the diagram is positioned as a visualization mechanically derived from it.

要求図では、AI との受け渡しは **CSV** で行います。要求の一覧（リスト）が本体であり、
図はそこから機械的に導かれる可視化だ、という位置づけのためです。

- To generate from requirements, write the requirement text in the Requirements tab and press **Generate Model**. / 要求から生成するときは、Requirements タブに要求文を書いて **Generate Model**。
- During a review, when you instruct e.g. “decompose SR-010 into two functional requirements,” the AI returns the requirement list in a ```` ```csv ```` block. ModelLogue parses it and automatically generates canonical PlantUML — including the preamble, macro calls, and review-state comments — and reflects it into the diagram. / レビュー中は「SR-010 を 2 つの機能要求に分解して」等と指示すると、AI が ```` ```csv ```` ブロックで
  要求リストを返します。ModelLogue はそれをパースし、プリアンブル＋マクロ呼び出し＋レビュー状態コメントを
  含む正規の PlantUML を自動生成して図に反映します。

### Applying proposals (automatic) and automatic markers / 提案の反映（自動）と自動マーカー

- Requirement-diagram proposals are **applied automatically** (there is no proposal view with an Apply button as in state machines). / 要求図の提案は **自動で反映** されます（状態遷移図のような Apply ボタン付きの提案ビューは出ません）。
- Changed parts are shown on the diagram with **automatic markers**: **added = solid green**, **changed = dashed orange**. / 変更箇所は図の上に **自動マーカー** で示されます。**追加＝緑の実線**、**変更＝橙の破線**。
- An apply can be reverted with **↶ Undo / ↷ Redo** on the diagram toolbar. / 反映は図ツールバーの **↶ Undo / ↷ Redo** で戻せます。

### Drop-out check on apply (guardrail) / 反映時の取りこぼし確認（ガードレール）

If the AI's CSV reply **silently drops** a requirement row that was present just before, the apply is paused and a confirmation modal is shown. Check the dropped requirement IDs, and if it is as intended press **Apply anyway**; otherwise you can cancel the apply with **Cancel**. This protects you from unexpectedly losing a review target.

AI の CSV 返信が、直前まであった要求の行を **黙って落として** しまった場合、反映を一時停止して
確認モーダルを表示します。落ちた要求 ID を確認し、意図どおりなら **Apply anyway**、そうでなければ
**Cancel** で反映を取りやめられます。レビュー対象を不意に失わないための保護です。

---

## Analysis tabs / 分析タブ

Following the shared Requirements and Source tabs, this type shows the following tabs.

Requirements・Source の共通タブに続いて、この型では次のタブが並びます。

### Requirement list / 要求一覧

Check the declared requirements in a list. The requirement list is the master, and the diagram is its visualization.

宣言された要求を一覧で確認します。要求リストが正本であり、図はその可視化という関係にあります。

### Traceability / トレーサビリティ

A matrix that gives an overview of the relationships among requirements (containment, derive, refine, satisfy, verify, trace). Check the connections between higher-level and lower-level requirements and the coverage of verification and satisfaction.

要求どうしの関係（包含・派生・詳細化・充足・検証・追跡）を俯瞰するマトリクスです。
上位要求と下位要求のつながり、検証・充足の網羅状況を確認します。

### Orphans / 孤立要求

A list of **requirements not connected to anything**, appearing in no relationship. Use it to find forgotten decompositions and missing traces.

どの関係にも現れない、**どこともつながっていない要求** の一覧です。
分解し忘れ・トレース漏れの発見に使います。

---

## How to proceed with a review of this type (a guide) / この型のレビューの進め方（目安）

1. Write the requirements in Requirements and press **Generate Model**, or write them directly with macros in Source. / Requirements に要求を書き **Generate Model**、または Source にマクロで直接記述。
2. In **Traceability**, check the higher/lower connections and the coverage of satisfaction and verification. / **Traceability** で、上位・下位のつながりや充足・検証の網羅を確認。
3. In **Orphans**, check whether there are any isolated requirements. / **Orphans** で孤立した要求がないかを確認。
4. Instruct the AI in chat to decompose or add → automatic apply (check the diff with the green/orange markers). / 分解・追記をチャットで AI に指示 → 自動反映（緑／橙のマーカーで差分を確認）。
5. Draw markers on points of concern. / 気になる箇所にマーカーを描く。
6. Choose a conclusion with **Save & finish** and save the evidence. / **Save & finish** で結論を選んで証跡を保存。

---

← [Back to the manual top / マニュアルのトップに戻る](index.md) ｜ Other types / 他の型：[State machine / 状態遷移図](state-machine.md) ／ [Process / プロセス図](process.md)
