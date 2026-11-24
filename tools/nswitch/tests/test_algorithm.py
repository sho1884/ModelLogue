"""Tests for §7.2 matrix and §7.4 test construction."""
import pytest

from modellogue_nswitch.algorithm import (
    build_tests,
    required_chains,
)
from modellogue_nswitch.layers import decompose
from modellogue_nswitch.parse_puml import parse_puml


def _flat_model():
    return parse_puml(
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Active : start\n"
        "Active --> Idle : stop\n"
        "Active --> [*] : done\n"
        "@enduml\n"
    )


def test_required_chains_n0_is_every_transition():
    layers = decompose(_flat_model())
    top = layers[0]
    chains = required_chains(top, n=0)
    # 4 transitions at the top layer: [*]_init→Idle (synthesized '()'),
    # Idle→Active, Active→Idle, Active→[*]_final
    assert len(chains) == 4
    # All chains are length 1.
    assert all(len(c) == 1 for c in chains)


def test_required_chains_n1_is_every_pair():
    layers = decompose(_flat_model())
    top = layers[0]
    chains = required_chains(top, n=1)
    # Pairs (A --> B --> C) enumerated by reachability.
    for c in chains:
        assert len(c) == 2
        assert c[0].target_state_id == c[1].source_state_id


def test_required_chains_n2_is_every_triple():
    layers = decompose(_flat_model())
    top = layers[0]
    chains = required_chains(top, n=2)
    assert all(len(c) == 3 for c in chains)


def test_required_chains_rejects_out_of_range_n():
    layers = decompose(_flat_model())
    with pytest.raises(ValueError):
        required_chains(layers[0], n=3)


def test_build_tests_flat_model_1_switch_covers_all_chains():
    layers = decompose(_flat_model())
    top = layers[0]
    lr = build_tests(top, n=1, require_final=False)
    assert not lr.unreachable
    # One or more tests whose concatenated `covers` contain every required chain.
    assert lr.tests
    all_transitions_in_tests = set()
    for t in lr.tests:
        for i in range(len(t.transitions) - 1):
            all_transitions_in_tests.add((t.transitions[i], t.transitions[i + 1]))
    for chain in required_chains(top, n=1):
        assert (chain[0], chain[1]) in all_transitions_in_tests


def test_build_tests_determinism():
    layers = decompose(_flat_model())
    top = layers[0]
    a = build_tests(top, n=1, require_final=False)
    b = build_tests(top, n=1, require_final=False)
    assert [t.transitions for t in a.tests] == [t.transitions for t in b.tests]


def test_build_tests_require_final_errors_on_cyclic_only_layer():
    model = parse_puml(
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Ready : boot\n"
        "Ready --> Running : start\n"
        "Running --> Ready : tick\n"
        "@enduml\n"
    )
    # No [*]_final — every test must either close on a cycle or be rejected.
    layers = decompose(model)
    top = layers[0]
    lr = build_tests(top, n=1, require_final=True)
    assert not lr.tests
    assert lr.unreachable
    assert all(
        u.reason.startswith("--require-final:") for u in lr.unreachable
    )


def test_build_tests_cycle_closure_fallback_for_mainloop_models():
    model = parse_puml(
        "@startuml\n"
        "[*] --> Idle\n"
        "Idle --> Ready : boot\n"
        "Ready --> Running : start\n"
        "Running --> Ready : tick\n"
        "@enduml\n"
    )
    layers = decompose(model)
    top = layers[0]
    lr = build_tests(top, n=1, require_final=False)
    # Without --require-final, the builder falls back to cycle-closure.
    assert lr.tests
    # No uncovered chains.
    assert not lr.unreachable
    # At least one test closed on cycle.
    assert any(t.closed_on_cycle for t in lr.tests)
