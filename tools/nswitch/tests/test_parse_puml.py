"""Conformance tests for the PlantUML subset parser.

Tied to the EBNF in ``src/grammars/stateDiagram.ebnf``: every supported
production gets at least one accept, every ADR-009 rejection gets at
least one reject.
"""
import pytest

from modellogue_nswitch.parse_puml import PumlParseError, parse_puml


def test_minimal_initial_and_final():
    m = parse_puml(
        "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"
    )
    ids = sorted(s.id for s in m.states)
    assert "A" in ids
    # When [*] is both source and target, parser classifies into init/final.
    types = {s.id: s.type for s in m.states}
    assert types["[*]"] == "initial"
    assert types["[*]_final"] == "final"


def test_state_alias_with_display_label():
    m = parse_puml(
        '@startuml\nstate "待機" as Idle\nIdle --> Active : go\n@enduml\n'
    )
    idle = next(s for s in m.states if s.id == "Idle")
    assert idle.label == "待機"


def test_bare_state_declaration():
    m = parse_puml("@startuml\nstate A\nA --> B : e\n@enduml\n")
    ids = {s.id for s in m.states}
    assert ids >= {"A", "B"}


def test_one_level_composite_with_internal_initial_and_transitions():
    m = parse_puml(
        "@startuml\n"
        "[*] --> Outer\n"
        "state Outer {\n"
        "  [*] --> X\n"
        "  X --> Y : inner\n"
        "}\n"
        "Outer --> [*] : exit\n"
        "@enduml\n"
    )
    comp = next(s for s in m.states if s.id == "Outer")
    assert comp.type == "composite"
    child_x = next(s for s in m.states if s.id == "X")
    assert child_x.parent_id == "Outer"
    # Composite-internal pseudo-states carry the synthesized ids.
    pseudo_ids = {s.id for s in m.states if s.type in ("initial", "final")}
    assert "__start_of_Outer__" in pseudo_ids


def test_transition_label_with_guard_and_action():
    m = parse_puml(
        "@startuml\n[*] --> A\nA --> B : e [x > 0] / f(y)\n@enduml\n"
    )
    t = next(
        t
        for t in m.transitions
        if t.source_state_id == "A" and t.target_state_id == "B"
    )
    assert t.event == "e"
    assert t.guard == "x > 0"
    assert t.action == "f(y)"


def test_tolerates_nonsemantic_directives():
    source = (
        "@startuml\n"
        "hide empty description\n"
        "skinparam stateBackgroundColor #EEF\n"
        "!theme cerulean\n"
        "left to right direction\n"
        "title My machine\n"
        "[*] --> A\n"
        "A --> [*] : done\n"
        "@enduml\n"
    )
    m = parse_puml(source)
    assert any(s.id == "A" for s in m.states)


def test_rejects_nested_composite():
    with pytest.raises(PumlParseError):
        parse_puml(
            "@startuml\n"
            "state Outer {\n"
            "  state Inner {\n"
            "    [*] --> X\n"
            "  }\n"
            "}\n"
            "@enduml\n"
        )


def test_rejects_history_pseudo_state():
    with pytest.raises(PumlParseError):
        parse_puml("@startuml\nA --> [H]\n@enduml\n")


def test_rejects_dot_notation_entry():
    with pytest.raises(PumlParseError):
        parse_puml("@startuml\nA --> Outer.Child : e\n@enduml\n")


def test_rejects_unclosed_composite():
    with pytest.raises(PumlParseError):
        parse_puml(
            "@startuml\nstate Outer {\n  [*] --> X\n@enduml\n"
        )


def test_rejects_unmatched_close_brace():
    with pytest.raises(PumlParseError):
        parse_puml("@startuml\n}\n@enduml\n")


def test_strips_inline_comments():
    m = parse_puml(
        "@startuml\n[*] --> A  ' this is a comment\nA --> [*] : done\n@enduml\n"
    )
    assert any(s.id == "A" for s in m.states)
