"""End-to-end tests for the generate API and CSV emitters (§1.1 / §6)."""
import json

from modellogue_nswitch import generate, parse_csv, parse_puml
from modellogue_nswitch.generate import (
    result_to_dict,
    scenarios_to_csv,
    tests_to_csv,
)

SIMPLE = "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"
LOOP = (
    "@startuml\n"
    "[*] --> Idle\n"
    "Idle --> Active : start\n"
    "Active --> Idle : stop\n"
    "Active --> [*] : done\n"
    "@enduml\n"
)


def test_tests_csv_is_columnar():
    result = generate(parse_puml(SIMPLE), n=0)
    header = tests_to_csv(result.tests).split("\n")[0]
    # 0-switch = single transition => one (event, reached) step.
    assert header == "seq,id,start,event_1,reached_1,scenarios"


def test_ids_use_scope_and_type():
    result = generate(parse_puml(LOOP), n=1, name="watch")
    assert result.tests, "expected positive tests"
    t = result.tests[0]
    assert t.type == "1S"
    assert t.scope == "watch"
    assert t.id.startswith("watch-1S-")
    assert t.steps and t.steps[0].reached  # (event, reached) pairs


def test_default_scope_is_untitled():
    result = generate(parse_puml(SIMPLE), n=0)
    assert all(t.id.startswith("untitled-") for t in result.tests)
    assert result.scopes == ["untitled"]


def test_invalid_mode_yields_negative_tests_only():
    result = generate(parse_puml(LOOP), n=0, invalid=True)
    assert result.tests, "expected INV tests"
    assert all(t.type == "INV" for t in result.tests)  # negatives only
    nt = result.tests[0]
    assert nt.expect == "no-transition"
    assert nt.event
    assert nt.id.startswith("untitled-INV-")
    # Positive mode has no INV tests.
    assert all(t.type != "INV" for t in generate(parse_puml(LOOP), n=0).tests)


def test_inv_csv_shape():
    result = generate(parse_puml(LOOP), n=0, invalid=True)
    header = tests_to_csv(result.tests).split("\n")[0]
    assert header == "seq,id,start,event,expect"


ALIASED = (
    "@startuml\n"
    "[*] --> Idle\n"
    'state "待機" as Idle\n'
    "Idle --> Active : start\n"
    'state "動作" as Active\n'
    "Active --> [*] : done\n"
    "@enduml\n"
)


def test_output_uses_diagram_labels_and_final_marker():
    result = generate(parse_puml(ALIASED), n=1, name="watch")
    states = {t.start for t in result.tests} | {
        s.reached for t in result.tests for s in t.steps
    }
    # Real states show their diagram label, not the internal id.
    assert "待機" in states and "動作" in states
    assert "Idle" not in states and "Active" not in states
    # Final marker rendered as (*), and no internal pseudo id leaks.
    assert "(*)" in states
    assert not any("[*]" in s for s in states)


def test_initial_marker_and_entry_step_are_not_emitted():
    result = generate(parse_puml(LOOP), n=1)
    # No Test starts at the initial marker, and no step reaches it.
    assert not any(t.start.startswith("[*]") for t in result.tests)
    assert not any(
        st.reached.startswith("[*]") for t in result.tests for st in t.steps
    )
    # Scenarios begin at the first real state, not the initial marker/() step.
    for s in result.scenarios:
        assert not s.start.startswith("[*]")
        assert s.steps and s.steps[0].event != "()"  # LOOP has no unlabeled edges


def test_invalid_mode_has_no_scenarios():
    result = generate(parse_puml(LOOP), n=0, invalid=True)
    assert result.tests
    assert result.scenarios == []


def test_scenarios_csv_and_cross_reference():
    result = generate(parse_puml(LOOP), n=1)
    assert result.scenarios
    sc_header = scenarios_to_csv(result.scenarios).split("\n")[0]
    assert sc_header.startswith("seq,id,start,event_1,reached_1")
    assert sc_header.endswith(",covers")
    # Cross-reference is populated in both directions.
    assert any(t.scenarios for t in result.tests)
    assert any(s.covers for s in result.scenarios)


def test_output_is_byte_deterministic():
    a = generate(parse_puml(LOOP), n=1)
    b = generate(parse_puml(LOOP), n=1)
    assert tests_to_csv(a.tests) == tests_to_csv(b.tests)
    assert scenarios_to_csv(a.scenarios) == scenarios_to_csv(b.scenarios)


COMPOSITE = (
    "@startuml\n"
    "[*] --> Idle\n"
    "Idle --> Outer : start\n"
    "state Outer {\n"
    "  [*] --> Running\n"
    "  Running --> Paused : pause\n"
    "  Paused --> Running : resume\n"
    "}\n"
    "Outer --> Idle : stop\n"
    "@enduml\n"
)

# The same behaviour drawn flat (composite inlined by hand).
MANUAL_FLAT = (
    "@startuml\n"
    "[*] --> Idle\n"
    "Idle --> Running : start\n"
    "Running --> Paused : pause\n"
    "Paused --> Running : resume\n"
    "Running --> Idle : stop\n"
    "Paused --> Idle : stop\n"
    "@enduml\n"
)


def test_composite_is_flattened_into_one_scope():
    result = generate(parse_puml(COMPOSITE), n=1, name="M")
    # Composite inlined → a single flat scope, not a separate child layer.
    assert result.scopes == ["M"]
    states = {t.start for t in result.tests} | {
        s.reached for t in result.tests for s in t.steps
    }
    # Children promoted; the composite node itself is gone.
    assert "Running" in states and "Paused" in states
    assert "Outer" not in states
    # Entry redirected to the composite's initial, and the group-escape
    # (Outer --stop--> Idle) replicated from every child.
    firsts = {(t.start, t.steps[0].event, t.steps[0].reached) for t in result.tests}
    assert ("Idle", "start", "Running") in firsts  # entry redirect
    assert ("Running", "stop", "Idle") in firsts  # escape from Running
    assert ("Paused", "stop", "Idle") in firsts  # escape from Paused


def test_flattening_matches_a_hand_flattened_model():
    # Coverage must not depend on how the model was drawn: a composite and its
    # manually flattened equivalent produce the SAME tests (ADR-009 revision).
    def sig(src, n):
        r = generate(parse_puml(src), n=n)
        return {
            (t.start, tuple((s.event, s.reached) for s in t.steps)) for t in r.tests
        }

    for n in (0, 1, 2):
        assert sig(COMPOSITE, n) == sig(MANUAL_FLAT, n)
    # And no spurious invalid on the composite (every cell is really handled).
    assert (
        len(generate(parse_puml(COMPOSITE), n=0, invalid=True).tests)
        == len(generate(parse_puml(MANUAL_FLAT), n=0, invalid=True).tests)
    )


def test_result_to_dict_is_json_serializable():
    result = generate(parse_puml(SIMPLE), n=0, invalid=True)
    payload = json.loads(json.dumps(result_to_dict(result)))
    assert payload["scopes"] == ["untitled"]
    assert "tests" in payload and "scenarios" in payload


def test_csv_and_puml_equivalent():
    puml = (
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Active : start\n"
        "Active --> Idle : stop\n"
        "Active --> [*] : reset\n"
        "@enduml\n"
    )
    csv_text = (
        "state,label,parent,type,initial,start,stop,reset\n"
        "Idle,,,normal,Y,Active,,\n"
        "Active,,,normal,,,Idle,[*]\n"
    )

    def patterns(r):
        return {
            (t.start, tuple((s.event, s.reached) for s in t.steps))
            for t in r.tests
        }

    assert patterns(generate(parse_puml(puml), n=1)) == patterns(
        generate(parse_csv(csv_text), n=1)
    )
