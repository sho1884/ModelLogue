"""End-to-end tests for the generate API and CSV emitters."""
from modellogue_nswitch import generate, parse_csv, parse_puml
from modellogue_nswitch.generate import (
    coverage_to_csv,
    result_to_dict,
    tests_to_csv,
)


def test_tests_csv_header_is_stable():
    model = parse_puml(
        "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"
    )
    result = generate(model, n=0)
    csv = tests_to_csv(result.tests)
    header = csv.split("\n")[0]
    assert header == (
        "test_id,kind,layer,length,start,sequence,end,inject,expect,covers"
    )


def test_invalid_generates_negative_tests():
    model = parse_puml(
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Active : start\n"
        "Active --> Idle : stop\n"
        "Active --> [*] : done\n"
        "@enduml\n"
    )
    # Events {start, stop, done}; invalid cells e.g. (Idle,stop), (Idle,done),
    # (Active,start) each become a negative test.
    result = generate(model, n=0, invalid=True)
    negatives = [t for t in result.tests if t.kind == "negative"]
    assert negatives, "expected negative tests for invalid cells"
    nt = negatives[0]
    assert nt.expect == "no-transition"
    assert nt.inject
    assert nt.covers.endswith("--x")
    assert any(r.kind == "invalid-transition" for r in result.coverage)
    # Without invalid, only positive tests are produced (unchanged behaviour).
    assert all(t.kind == "positive" for t in generate(model, n=0).tests)


def test_output_is_byte_deterministic():
    source = (
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Active : start\n"
        "Active --> Idle : stop\n"
        "Active --> [*] : done\n"
        "@enduml\n"
    )
    a = generate(parse_puml(source), n=1)
    b = generate(parse_puml(source), n=1)
    assert tests_to_csv(a.tests) == tests_to_csv(b.tests)
    assert coverage_to_csv(a.coverage, a.tests) == coverage_to_csv(
        b.coverage, b.tests
    )


def test_csv_input_produces_identical_model_to_puml():
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
    r_puml = generate(parse_puml(puml), n=1)
    r_csv = generate(parse_csv(csv_text), n=1)
    # Same set of required chains and equivalent test coverage.
    assert {row.element for row in r_puml.coverage} == {
        row.element for row in r_csv.coverage
    }


def test_layered_decomposition_emits_one_layer_per_composite():
    model = parse_puml(
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
    result = generate(model, n=1, layered=True)
    assert "top" in result.layers
    assert "Outer" in result.layers


def test_no_layered_keeps_only_top():
    model = parse_puml(
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Outer : start\n"
        "state Outer {\n"
        "  [*] --> R\n"
        "  R --> R : tick\n"
        "}\n"
        "Outer --> Idle : stop\n"
        "@enduml\n"
    )
    result = generate(model, n=1, layered=False)
    assert result.layers == ["top"]


def test_result_to_dict_is_plain_json_serializable():
    import json

    model = parse_puml(
        "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"
    )
    result = generate(model, n=0)
    payload = result_to_dict(result)
    # Round-trip through JSON to confirm no non-serializable types leaked.
    round_tripped = json.loads(json.dumps(payload))
    assert round_tripped["layers"] == ["top"]


def test_coverage_csv_marks_chains_with_hash():
    model = parse_puml(
        "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"
    )
    result = generate(model, n=0)
    csv = coverage_to_csv(result.coverage, result.tests)
    # At least one row with a '#' in a test column.
    body = csv.split("\n")[1:]
    assert any("," + "#" + "," in row or row.strip().endswith(",#") or ",#," in row for row in body)
