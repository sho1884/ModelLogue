"""Orchestrator for the library API (§9) and the CLI.

Builds **Tests** (the coverage patterns to verify — primary) and **Scenarios**
(executable walks that cover them — secondary), per §1.1 / §6 of
``Requirements_Specification.md``. Output is columnar (§6): one column per
`(event, guard, action, reached)` step, not a packed string.

Guards are shown, never evaluated (§7.4.1, ADR-019): walks are built from how
transitions connect, every step carries its guard and action as written, and a
Scenario lists the guarded steps it assumes in ``preconditions``.

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
    guard: str  # guard text without the brackets; "" when the transition has none
    action: str  # "" when the transition has none
    reached: str


@dataclass(slots=True)
class Precondition:
    """A guard a Scenario assumes to hold at one of its steps (§6.2, §7.4.1)."""

    step: int  # 1-based step number within the Scenario
    guard: str


@dataclass(slots=True)
class Test:
    id: str
    type: str  # "0S" | "1S" | "2S" | "INV"
    scope: str
    start: str
    # Positive: the chain's (event, reached) steps. INV: empty (uses the
    # dedicated fields below).
    steps: list[Step] = field(default_factory=list)
    # INV only — the pure (state, forbidden event) -> no-transition condition.
    # `start` above is the state; these two complete it. No path/scenario is
    # carried: reaching the state is a runner procedure, not a test condition.
    event: str = ""  # the forbidden event injected at `start`
    expect: str = ""  # "no-transition"
    # Positive only: Scenario ids that exercise this Test.
    scenarios: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Scenario:
    id: str
    scope: str
    start: str
    steps: list[Step]
    covers: list[str] = field(default_factory=list)  # positive Test ids
    # Guarded steps this walk passes through, in step order. The generator does
    # not evaluate guards, so these are what the tester must make true.
    preconditions: list[Precondition] = field(default_factory=list)


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
    return [
        Step(
            event=_event_of(t),
            guard=t.guard or "",
            action=t.action or "",
            reached=t.target_state_id,
        )
        for t in seq
    ]


def _preconditions_of(steps: list[Step]) -> list[Precondition]:
    return [Precondition(step=i, guard=s.guard) for i, s in enumerate(steps, start=1) if s.guard]


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


def _display_state(sid: str, layer: Layer, label_of: dict[str, str]) -> str:
    """Render a state id for output (§6), matching what the diagram shows:

    - a real state -> its diagram **label** (e.g. `Idle` -> `待機`);
    - the layer's final marker (`◉`) -> `(*)`.

    The initial marker (`●`) is never rendered — it is not a state, only a
    pointer to where the machine begins; callers strip it so walks start at
    the first real state (§1.1 / §7.5).
    """
    if sid == layer.final_id:
        return "(*)"
    return label_of.get(sid, sid)


def _display_walk(
    start: str,
    steps: list[Step],
    layer: Layer,
    label_of: dict[str, str],
) -> tuple[str, list[Step]]:
    """Turn a raw (start, steps) walk into its display form (§6):

    strip the leading initial-marker step so the walk begins at the first real
    state (the initial marker is not a state), then render every state via
    :func:`_display_state` (labels; final -> ``(*)``). Events, guards and
    actions are unchanged.
    """
    if start == layer.initial_id and steps:
        start = steps[0].reached  # target of the (dropped) entry transition
        steps = steps[1:]
    d_start = _display_state(start, layer, label_of)
    d_steps = [
        Step(
            event=s.event,
            guard=s.guard,
            action=s.action,
            reached=_display_state(s.reached, layer, label_of),
        )
        for s in steps
    ]
    return d_start, d_steps


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
        label_of = {s.id: s.label for s in layer.states}

        if invalid:
            # INV mode: negative Tests only (never mixed with positive 0S).
            # A forbidden transition can't sit on a walk, so no Scenarios exist
            # here (§1.1) — we don't even build the positive cover.
            negs, neg_unreach = build_negative_tests(
                layer, max_cycle_unroll=max_cycle_unroll
            )
            uncovered.extend(neg_unreach)
            for i, nt in enumerate(negs, start=1):
                all_tests.append(
                    Test(
                        id=f"{scope}-INV-{i:03d}",
                        type="INV",
                        scope=scope,
                        start=_display_state(nt.source_state, layer, label_of),
                        event=nt.inject_event,
                        expect="no-transition",
                    )
                )
            continue

        # Positive mode: Scenarios (greedy cover walks) + positive Tests.
        lr = build_tests(
            layer, n, max_cycle_unroll=max_cycle_unroll, require_final=require_final
        )
        uncovered.extend(lr.unreachable)
        scen_paths = lr.tests
        scenarios: list[Scenario] = []
        for i, tp in enumerate(scen_paths, start=1):
            d_start, d_steps = _display_walk(
                tp.start, _steps_of(tp.transitions), layer, label_of
            )
            scenarios.append(
                Scenario(
                    id=f"{scope}-SC-{i:03d}",
                    scope=scope,
                    start=d_start,
                    steps=d_steps,
                    preconditions=_preconditions_of(d_steps),
                )
            )

        # Positive Tests — one per required chain **over real transitions**.
        # "Entering the machine" is not a transition to test, so a chain that
        # begins at the initial marker is skipped: the real transition it would
        # carry (e.g. the first `start`) is already covered by chains that begin
        # at a real state, so keeping the entry chain only produces a redundant,
        # entry-stripped duplicate (§1.1 / §7.5). N-switch semantics are pattern-
        # over-real-transitions: a level-N Test needs N+1 *real* consecutive
        # transitions; boundary transitions with no real neighbour are covered at
        # a lower level, not padded out with the entry marker.
        type_ = f"{n}S"
        built: list[tuple[Test, Chain]] = []
        seq = 0
        for c in required_chains(layer, n):
            if c[0].source_state_id == layer.initial_id:
                continue  # machine-entry chain — not a real test
            d_start, d_steps = _display_walk(
                c[0].source_state_id, _steps_of(c), layer, label_of
            )
            seq += 1
            built.append(
                (
                    Test(
                        id=f"{scope}-{type_}-{seq:03d}",
                        type=type_,
                        scope=scope,
                        start=d_start,
                        steps=d_steps,
                    ),
                    c,
                )
            )
        # Cross-reference Tests <-> Scenarios on the raw transitions.
        for t, c in built:
            for sc, tp in zip(scenarios, scen_paths):
                if _path_contains_chain(tp.transitions, c):
                    t.scenarios.append(sc.id)
                    sc.covers.append(t.id)

        all_tests.extend(t for t, _ in built)
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


def _step_header(k: int) -> list[str]:
    header: list[str] = []
    for i in range(1, k + 1):
        header += [f"event_{i}", f"guard_{i}", f"action_{i}", f"reached_{i}"]
    return header


def _step_cells(steps: list[Step], k: int) -> list[str]:
    cells: list[str] = []
    for i in range(k):
        if i < len(steps):
            st = steps[i]
            cells += [st.event, st.guard, st.action, st.reached]
        else:
            cells += ["", "", "", ""]
    return cells


def preconditions_cell(pre: list[Precondition]) -> str:
    """`<step>:[<guard>]`, semicolon-separated, in step order (§6.2)."""
    return ";".join(f"{p.step}:[{p.guard}]" for p in pre)


def tests_to_csv(tests: list[Test]) -> str:
    """§6.1. Homogeneous per call: all positive (columnar) or all INV."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    is_inv = bool(tests) and all(t.type == "INV" for t in tests)

    if is_inv:
        writer.writerow(["seq", "id", "start", "event", "expect"])
        for seq, t in enumerate(tests, start=1):
            writer.writerow([seq, t.id, t.start, t.event, t.expect])
        return buf.getvalue()

    k = _max_steps(tests)  # uniform within a positive level
    writer.writerow(["seq", "id", "start", *_step_header(k), "scenarios"])
    for seq, t in enumerate(tests, start=1):
        writer.writerow([seq, t.id, t.start, *_step_cells(t.steps, k), ";".join(t.scenarios)])
    return buf.getvalue()


def scenarios_to_csv(scenarios: list[Scenario]) -> str:
    """§6.2. Columnar; walks vary in length so trailing cells are padded."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    k = _max_steps(scenarios)
    writer.writerow(["seq", "id", "start", *_step_header(k), "covers", "preconditions"])
    for seq, s in enumerate(scenarios, start=1):
        writer.writerow(
            [
                seq,
                s.id,
                s.start,
                *_step_cells(s.steps, k),
                ";".join(s.covers),
                preconditions_cell(s.preconditions),
            ]
        )
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
    "Precondition",
    "Test",
    "Scenario",
    "GenerationResult",
    "generate",
    "tests_to_csv",
    "scenarios_to_csv",
    "result_to_dict",
]
