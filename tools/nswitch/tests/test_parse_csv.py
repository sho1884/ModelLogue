"""Tests for the canonical CSV parser (§4.2)."""
import pytest

from modellogue_nswitch.parse_csv import CsvParseError, parse_csv


def test_flat_example_section_4_2_6():
    text = (
        "state,label,parent,type,initial,start,stop,fault,reset\n"
        "Idle,待機,,normal,Y,Active,,,\n"
        "Active,動作,,normal,,,Idle,Failure,[*]\n"
        "Failure,故障,,normal,,,,,Idle\n"
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


def test_initial_cell_with_guard_and_action():
    text = (
        "state,label,parent,type,initial,e\n"
        "A,,,normal,Y [ready] / init(),B\n"
        "B,,,normal,,\n"
    )
    m = parse_csv(text)
    init_t = next(t for t in m.transitions if t.source_state_id == "[*]_init")
    assert init_t.guard == "ready"
    assert init_t.action == "init()"


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
