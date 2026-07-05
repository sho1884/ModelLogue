"""Orchestrator for the library API (§9) and the CLI.

Builds **Tests** (the coverage patterns to verify — primary) and **Scenarios**
(executable walks that cover them — secondary), per §1.1 / §6 of
``Requirements_Specification.md``. Output is columnar (§6): one column per
`(event, reached)` step, not a packed string.

The path-algebra / cover algorithm in ``algorithm.py`` is unchanged: the
required chains are the positive Tests, the invalid cells are the negative
(``INV``) Tests, and the greedy cover paths are the Scenarios.
"""
from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass, field

from .algorithm import (
    Chain,
    Unreachable,
    build_negative_tests,
    build_tests,
    required_chains,
)
from .layers import Layer, decompose
from .model import StateMachineModel, Transition


@dataclass(slots=True)
class Step:
    event: str
    reached: str


@dataclass(slots=True)
class Test:
    id: str
    type: str  # "0S" | "1S" | "2S" | "INV"
    scope: str
    start: str
    # Positive: the chain's (event, reached) steps. INV: empty (uses the
    # dedicated fields below).
    steps: list[Step] = field(default_factory=list)
    # INV only:
    event: str = ""  # the forbidden event injected at `start`
    expect: str = ""  # "no-transition"
    reach: str = ""  # a Scenario id whose walk passes through `start`, or ""
    # Positive only: Scenario ids that exercise this Test.
    scenarios: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Scenario:
    id: str
    scope: str
    start: str
    steps: list[Step]
    covers: list[str] = field(default_factory=list)  # positive Test ids


@dataclass(slots=True)
class GenerationResult:
    tests: list[Test]
    scenarios: list[Scenario]
    uncovered: list[Unreachable]
    scopes: list[str]


# ---------- helpers ----------


def _event_of(t: Transition) -> str:
    return t.event if t.event else "()"


def _steps_of(seq: tuple[Transition, ...]) -> list[Step]:
    return [Step(event=_event_of(t), reached=t.target_state_id) for t in seq]


def _scope_of(layer: Layer, name: str) -> str:
    # The outermost machine has no intrinsic name; use the caller-supplied
    # `name` (default "untitled", §1.1). Child layers use the composite id.
    return name if layer.name == "top" else layer.name


def _path_contains_chain(path: tuple[Transition, ...], chain: Chain) -> bool:
    """True if `chain` appears as a contiguous subsequence of `path`."""
    k = len(chain)
    for i in range(len(path) - k + 1):
        if path[i : i + k] == chain:
            return True
    return False


def _states_on(scenario: Scenario) -> set[str]:
    return {scenario.start, *(s.reached for s in scenario.steps)}


# ---------- generation ----------


def generate(
    model: StateMachineModel,
    *,
    n: int = 1,
    invalid: bool = False,
    name: str = "untitled",
    layered: bool = True,
    max_cycle_unroll: int = 3,
    require_final: bool = False,
) -> GenerationResult:
    if n not in (0, 1, 2):
        raise ValueError(f"n must be 0, 1, or 2 (got {n})")

    layers: list[Layer] = decompose(model, layered=layered)
    all_tests: list[Test] = []
    all_scenarios: list[Scenario] = []
    uncovered: list[Unreachable] = []

    for layer in layers:
        scope = _scope_of(layer, name)

        # Scenarios — the greedy cover walks (always produced; secondary).
        lr = build_tests(
            layer, n, max_cycle_unroll=max_cycle_unroll, require_final=require_final
        )
        uncovered.extend(lr.unreachable)
        scenarios: list[Scenario] = [
            Scenario(
                id=f"{scope}-SC-{i:03d}",
                scope=scope,
                start=tp.start,
                steps=_steps_of(tp.transitions),
            )
            for i, tp in enumerate(lr.tests, start=1)
        ]

        if invalid:
            # INV mode: negative Tests only (never mixed with positive 0S).
            negs, neg_unreach = build_negative_tests(
                layer, max_cycle_unroll=max_cycle_unroll
            )
            uncovered.extend(neg_unreach)
            for i, nt in enumerate(negs, start=1):
                reach = next(
                    (
                        sc.id
                        for sc, tp in zip(scenarios, lr.tests)
                        if nt.source_state in _states_on(sc)
                    ),
                    "",
                )
                all_tests.append(
                    Test(
                        id=f"{scope}-INV-{i:03d}",
                        type="INV",
                        scope=scope,
                        start=nt.source_state,
                        event=nt.inject_event,
                        expect="no-transition",
                        reach=reach,
                    )
                )
        else:
            # Positive Tests — one per required chain at level n.
            chains = required_chains(layer, n)
            type_ = f"{n}S"
            pos: list[Test] = [
                Test(
                    id=f"{scope}-{type_}-{i:03d}",
                    type=type_,
                    scope=scope,
                    start=c[0].source_state_id,
                    steps=_steps_of(c),
                )
                for i, c in enumerate(chains, start=1)
            ]
            # Cross-reference Tests <-> Scenarios.
            for t, c in zip(pos, chains):
                for sc, tp in zip(scenarios, lr.tests):
                    if _path_contains_chain(tp.transitions, c):
                        t.scenarios.append(sc.id)
                        sc.covers.append(t.id)
            all_tests.extend(pos)

        all_scenarios.extend(scenarios)

    for t in all_tests:
        t.scenarios.sort()
    for s in all_scenarios:
        s.covers.sort()

    return GenerationResult(
        tests=all_tests,
        scenarios=all_scenarios,
        uncovered=uncovered,
        scopes=[_scope_of(layer, name) for layer in layers],
    )


# ---------- CSV emitters (§6, columnar) ----------


def _max_steps(items) -> int:
    return max((len(x.steps) for x in items), default=0)


def tests_to_csv(tests: list[Test]) -> str:
    """§6.1. Homogeneous per call: all positive (columnar) or all INV."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    is_inv = bool(tests) and all(t.type == "INV" for t in tests)

    if is_inv:
        writer.writerow(["seq", "id", "start", "event", "expect", "reach"])
        for seq, t in enumerate(tests, start=1):
            writer.writerow([seq, t.id, t.start, t.event, t.expect, t.reach])
        return buf.getvalue()

    k = _max_steps(tests)  # uniform within a positive level
    header = ["seq", "id", "start"]
    for i in range(1, k + 1):
        header += [f"event_{i}", f"reached_{i}"]
    header.append("scenarios")
    writer.writerow(header)
    for seq, t in enumerate(tests, start=1):
        row = [seq, t.id, t.start]
        for i in range(k):
            if i < len(t.steps):
                row += [t.steps[i].event, t.steps[i].reached]
            else:
                row += ["", ""]
        row.append(";".join(t.scenarios))
        writer.writerow(row)
    return buf.getvalue()


def scenarios_to_csv(scenarios: list[Scenario]) -> str:
    """§6.2. Columnar; walks vary in length so trailing cells are padded."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    k = _max_steps(scenarios)
    header = ["seq", "id", "start"]
    for i in range(1, k + 1):
        header += [f"event_{i}", f"reached_{i}"]
    header.append("covers")
    writer.writerow(header)
    for seq, s in enumerate(scenarios, start=1):
        row = [seq, s.id, s.start]
        for i in range(k):
            if i < len(s.steps):
                row += [s.steps[i].event, s.steps[i].reached]
            else:
                row += ["", ""]
        row.append(";".join(s.covers))
        writer.writerow(row)
    return buf.getvalue()


def result_to_dict(result: GenerationResult) -> dict:
    """Serialize a GenerationResult as a plain dict (library / HTTP API)."""
    return {
        "tests": [asdict(t) for t in result.tests],
        "scenarios": [asdict(s) for s in result.scenarios],
        "uncovered": [
            {
                "scope": u.layer_name,
                "chain": [
                    {
                        "source": t.source_state_id,
                        "target": t.target_state_id,
                        "event": t.event,
                        "guard": t.guard,
                        "action": t.action,
                    }
                    for t in u.chain
                ],
                "reason": u.reason,
            }
            for u in result.uncovered
        ],
        "scopes": result.scopes,
    }


__all__ = [
    "Step",
    "Test",
    "Scenario",
    "GenerationResult",
    "generate",
    "tests_to_csv",
    "scenarios_to_csv",
    "result_to_dict",
]
