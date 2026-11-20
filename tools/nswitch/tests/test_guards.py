"""Guards and actions in the output (§6, §7.4.1, ADR-019).

Guards are shown, not evaluated: every step carries its guard and action, and a
Scenario lists the guarded steps it assumes in ``preconditions``. The models are
the library-loan example from §7.4.1 (history as a guard vs. history as a state).
"""
import csv
import io
import json

from modellogue_nswitch import generate, parse_puml
from modellogue_nswitch.generate import (
    preconditions_cell,
    result_to_dict,
    scenarios_to_csv,
    tests_to_csv,
)

# History written as guards — the shape §7.4.1 advises against.
HISTORY_AS_GUARD = """@startuml
[*] --> 在庫
在庫 --> 貸出中 : 貸出
貸出中 --> 貸出中 : 返却期限経過 / 延滞を記録する
貸出中 --> 在庫 : 返却 [期限内]
貸出中 --> 利用停止 : 返却 [期限経過済]
利用停止 --> [*]
@enduml
"""

# The same behaviour with the history as a state — no guards at all.
HISTORY_AS_STATE = """@startuml
[*] --> 在庫
在庫 --> 貸出中 : 貸出
貸出中 --> 延滞中 : 返却期限経過 / 延滞を記録する
貸出中 --> 在庫 : 返却
延滞中 --> 利用停止 : 返却
利用停止 --> [*]
@enduml
"""


def _rows(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def test_steps_carry_guard_and_action():
    result = generate(parse_puml(HISTORY_AS_GUARD), n=0, name="lib")
    rows = _rows(tests_to_csv(result.tests))
    returns = sorted(
        (r["guard_1"], r["reached_1"]) for r in rows if r["start"] == "貸出中" and r["event_1"] == "返却"
    )
    # Same start, same event: the two Tests differ by guard (BUG-2).
    assert returns == [("期限内", "在庫"), ("期限経過済", "利用停止")]
    overdue = next(r for r in rows if r["event_1"] == "返却期限経過")
    assert overdue["guard_1"] == "" and overdue["action_1"] == "延滞を記録する"


def test_guard_and_action_columns_are_always_present():
    result = generate(parse_puml(HISTORY_AS_STATE), n=1, name="lib")
    header = tests_to_csv(result.tests).split("\n")[0].split(",")
    assert header == [
        "seq", "id", "start",
        "event_1", "guard_1", "action_1", "reached_1",
        "event_2", "guard_2", "action_2", "reached_2",
        "scenarios",
    ]
    sc_header = scenarios_to_csv(result.scenarios).split("\n")[0].split(",")
    assert sc_header[-2:] == ["covers", "preconditions"]


def test_scenarios_state_the_guards_they_assume():
    result = generate(parse_puml(HISTORY_AS_GUARD), n=0, name="lib")
    for sc in result.scenarios:
        guarded = [(i, s.guard) for i, s in enumerate(sc.steps, start=1) if s.guard]
        assert [(p.step, p.guard) for p in sc.preconditions] == guarded
    # The generator does not evaluate guards: some walk takes the
    # 「期限経過済」 return without the 「返却期限経過」 step that makes it
    # true (BUG-1). The walk is still emitted — and says what it assumes.
    unexecutable = [
        sc
        for sc in result.scenarios
        if any(s.guard == "期限経過済" for s in sc.steps)
        and not any(s.event == "返却期限経過" for s in sc.steps)
    ]
    assert unexecutable
    for sc in unexecutable:
        assert any(p.guard == "期限経過済" for p in sc.preconditions)


def test_preconditions_csv_cell():
    result = generate(parse_puml(HISTORY_AS_GUARD), n=0, name="lib")
    for sc, row in zip(result.scenarios, _rows(scenarios_to_csv(result.scenarios))):
        expected = ";".join(f"{p.step}:[{p.guard}]" for p in sc.preconditions)
        assert row["preconditions"] == expected == preconditions_cell(sc.preconditions)
        for p in sc.preconditions:
            assert row[f"guard_{p.step}"] == p.guard


def test_unguarded_model_has_no_preconditions():
    for n in (0, 1, 2):
        result = generate(parse_puml(HISTORY_AS_STATE), n=n, name="lib")
        assert all(not sc.preconditions for sc in result.scenarios)
        rows = _rows(tests_to_csv(result.tests)) + _rows(scenarios_to_csv(result.scenarios))
        assert all(v == "" for r in rows for k, v in r.items() if k.startswith("guard_"))
        assert all(r.get("preconditions", "") == "" for r in rows)
        # Actions are still reported.
        assert any(v == "延滞を記録する" for r in rows for k, v in r.items() if k.startswith("action_"))


def test_json_shape():
    d = result_to_dict(generate(parse_puml(HISTORY_AS_GUARD), n=0, name="lib"))
    step = d["tests"][0]["steps"][0]
    assert list(step) == ["event", "guard", "action", "reached"]
    guarded = [sc for sc in d["scenarios"] if sc["preconditions"]]
    assert guarded
    assert set(guarded[0]["preconditions"][0]) == {"step", "guard"}
    json.dumps(d, ensure_ascii=False)  # serializable


def test_guard_text_with_csv_metacharacters_round_trips():
    src = '@startuml\n[*] --> A\nA --> B : go [x, "y"; z] / do a, b\nB --> [*]\n@enduml\n'
    result = generate(parse_puml(src), n=0)
    row = next(r for r in _rows(tests_to_csv(result.tests)) if r["event_1"] == "go")
    assert row["guard_1"] == 'x, "y"; z'
    assert row["action_1"] == "do a, b"
    sc_row = _rows(scenarios_to_csv(result.scenarios))[0]
    assert sc_row["preconditions"] == '1:[x, "y"; z]'
