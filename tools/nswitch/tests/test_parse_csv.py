"""Tests for the canonical CSV parser (§4.2)."""
import pytest

from modellogue_nswitch.parse_csv import CsvParseError, parse_csv


def _events_of(model, source):
    """The events with an outgoing transition from `source`."""
    return sorted(t.event for t in model.transitions if t.source_state_id == source)


# §4.2.2 no-transition markers. The point of the rule is that this tool's input
# is NOT only its own output: a state transition table arrives from a person in
# a spreadsheet or from another MBT tool, and blank is the least likely thing
# any of them wrote. Every form below must land on the identical model — the
# absence of the transition — because §7.2 derives the INV negative tests from
# exactly that absence.
@pytest.mark.parametrize(
    "marker,why",
    [
        ("-", "canonical (U+002D)"),
        ("", "pre-v8.1 canonical — must keep parsing forever"),
        ("—", "em dash: what a spreadsheet autocorrects `-` into"),
        ("–", "en dash: ditto"),
        ("×", "hand-written tables"),
        ("x", "hand-written tables"),
        ("X", "case-insensitive"),
        ("N/A", "hand-written tables"),
        ("n/a", "case-insensitive"),
        ("NA", "hand-written tables"),
        (" - ", "trimmed before matching"),
    ],
)
def test_no_transition_markers_all_mean_no_transition(marker, why):
    text = (
        "state,label,parent,type,initial,go,stop\n"
        f"Idle,,,normal,Y,Running,{marker}\n"
        f"Running,,,normal,,{marker},Idle\n"
    )
    m = parse_csv(text)
    # `Idle` fires only on `go`; `Running` only on `stop`. The marker cells
    # produced nothing at all — not a transition to a state named "-".
    assert _events_of(m, "Idle") == ["go"], why
    assert _events_of(m, "Running") == ["stop"], why
    assert not any(t.target_state_id == marker.strip() for t in m.transitions), why


def test_marker_lookalike_inside_a_state_id_is_not_a_marker():
    # `-` is a legal character in a state id. Only a WHOLE cell is a marker, so
    # a target that merely contains one must survive.
    text = (
        "state,label,parent,type,initial,go,stop\n"
        "Idle,,,normal,Y,Well-Formed,-\n"
        "Well-Formed,,,normal,,-,Idle\n"
    )
    m = parse_csv(text)
    go = [t for t in m.transitions if t.source_state_id == "Idle" and t.event == "go"]
    assert len(go) == 1
    assert go[0].target_state_id == "Well-Formed"


def test_marker_mixed_into_a_multi_transition_cell_is_an_error():
    # A cell cannot both have and not have transitions, so `-` beside real
    # targets is a typo, not a marker. Fail loudly rather than silently drop it.
    text = (
        "state,label,parent,type,initial,go,stop\n"
        "Idle,,,normal,Y,Running; -,-\n"
        "Running,,,normal,,-,Idle\n"
    )
    with pytest.raises(CsvParseError, match="is not a declared state"):
        parse_csv(text)


def test_flat_example_section_4_2_6():
    text = (
        "state,label,parent,type,initial,start,stop,fault,reset\n"
        "Idle,待機,,normal,Y,Active,-,-,-\n"
        "Active,動作,,normal,,-,Idle,Failure,[*]\n"
        "Failure,故障,,normal,,-,-,-,Idle\n"
    )
    m = parse_csv(text)
    real_ids = sorted(s.id for s in m.states if s.type in ("normal", "composite"))
    assert real_ids == ["Active", "Failure", "Idle"]
    # Pseudo-states synthesized at the top layer.
    pseudo_types = {
        s.id: s.type
        for s in m.states
        if s.type in ("initial", "final")
    }
    assert pseudo_types.get("[*]_init") == "initial"
    assert pseudo_types.get("[*]_final") == "final"
    # Initial transition.
    init_trans = [t for t in m.transitions if t.source_state_id == "[*]_init"]
    assert len(init_trans) == 1
    assert init_trans[0].target_state_id == "Idle"
    # `[*]` target in the `reset` column becomes a transition to [*]_final.
    reset_to_final = [
        t
        for t in m.transitions
        if t.source_state_id == "Active"
        and t.event == "reset"
        and t.target_state_id == "[*]_final"
    ]
    assert len(reset_to_final) == 1


def test_composite_example_section_4_2_7():
    text = (
        "state,label,parent,type,initial,start,stop,pause,resume\n"
        "Idle,,,normal,Y,Operating,,,\n"
        "Operating,,,composite,,,Idle,,\n"
        "Running,,Operating,normal,Y,,,Paused,\n"
        "Paused,,Operating,normal,,,,,Running\n"
    )
    m = parse_csv(text)
    operating = next(s for s in m.states if s.id == "Operating")
    assert operating.type == "composite"
    running = next(s for s in m.states if s.id == "Running")
    assert running.parent_id == "Operating"
    # Each layer synthesizes its own init pseudo-state.
    init_ids = {
        s.id for s in m.states if s.type == "initial"
    }
    assert "[*]_init" in init_ids
    assert "[*]_init_Operating" in init_ids


def test_label_defaults_to_id_when_empty():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,Y,B\n"
        "B,,,normal,,\n"
    )
    m = parse_csv(text)
    a = next(s for s in m.states if s.id == "A")
    assert a.label == "A"


def test_initial_cell_with_action():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,Y / init(),B\n"
        "B,,,normal,,\n"
    )
    m = parse_csv(text)
    init_t = next(t for t in m.transitions if t.source_state_id == "[*]_init")
    assert init_t.guard is None
    assert init_t.action == "init()"


@pytest.mark.parametrize("cell", ["Y [ready]", "Y [ready] / init()"])
def test_initial_cell_with_guard_is_rejected(cell):
    # §4.2.3: an initial transition carries an action only (UML).
    text = (
        "state,label,parent,type,initial,e\n"
        f"A,,,normal,{cell},B\n"
        "B,,,normal,,\n"
    )
    with pytest.raises(CsvParseError, match="cannot have an event or guard"):
        parse_csv(text)


def test_semicolon_separated_multiple_transitions():
    text = (
        "state,label,parent,type,initial,e\n"
        'A,,,normal,Y,"B [x]; C [!x]"\n'
        "B,,,normal,,\n"
        "C,,,normal,,\n"
    )
    m = parse_csv(text)
    transitions_from_a = [t for t in m.transitions if t.source_state_id == "A"]
    by_target = {t.target_state_id: t for t in transitions_from_a}
    assert set(by_target) == {"B", "C"}
    assert by_target["B"].guard == "x"
    assert by_target["C"].guard == "!x"


def test_rejects_unknown_parent():
    text = (
        "state,label,parent,type,initial,e\n"
        "Child,,Missing,normal,Y,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)


def test_rejects_parent_that_is_not_composite():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,,\n"
        "B,,A,normal,Y,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)


def test_rejects_nested_composite():
    text = (
        "state,label,parent,type,initial,e\n"
        "Outer,,,composite,,\n"
        "Middle,,Outer,composite,,\n"
        "Leaf,,Middle,normal,Y,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)


def test_rejects_duplicate_state_id():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,Y,A\n"
        "A,,,normal,,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)


def test_rejects_invalid_type_value():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,foo,Y,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)


def test_rejects_multiple_initials_in_same_layer():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,Y,\n"
        "B,,,normal,Y,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)


def test_rejects_bad_initial_marker():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,X,\n"
    )
    with pytest.raises(CsvParseError):
        parse_csv(text)
