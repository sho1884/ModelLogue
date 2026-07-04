"""Orchestrator for the library API (§9) and the CLI.

Produces test cases per §7.4 and optionally a coverage report per §6.2.
"""
from __future__ import annotations

import csv
import io
from dataclasses import asdict, dataclass, field

from .algorithm import (
    Chain,
    LayerResult,
    NegativeTest,
    TestPath,
    Unreachable,
    build_negative_tests,
    build_tests,
    chain_str,
    required_chains,
    transition_str,
)
from .layers import Layer, decompose
from .model import StateMachineModel, Transition


@dataclass(slots=True)
class TestCase:
    test_id: str
    kind: str  # "positive" | "negative"
    layer: str
    length: int
    start: str
    sequence: str
    end: str
    inject: str  # negative only: the invalid event injected at `end`
    expect: str  # negative only: "no-transition"
    covers: str


@dataclass(slots=True)
class CoverageRow:
    kind: str  # "transition" or "chain"
    layer: str
    element: str
    # test_id -> marker ("#", "x", or "")
    hits: dict[str, str] = field(default_factory=dict)
    status: str = ""  # "unreachable-within-cap" etc.
    reason: str = ""


@dataclass(slots=True)
class GenerationResult:
    tests: list[TestCase]
    coverage: list[CoverageRow]
    uncovered: list[Unreachable]
    layers: list[str]


def generate(
    model: StateMachineModel,
    *,
    n: int = 1,
    invalid: bool = False,
    layered: bool = True,
    max_cycle_unroll: int = 3,
    require_final: bool = False,
) -> GenerationResult:
    if n not in (0, 1, 2):
        raise ValueError(f"n must be 0, 1, or 2 (got {n})")

    layers: list[Layer] = decompose(model, layered=layered)
    layer_results: list[LayerResult] = [
        build_tests(
            layer,
            n,
            max_cycle_unroll=max_cycle_unroll,
            require_final=require_final,
        )
        for layer in layers
    ]

    # Negative tests for invalid transitions (§7.2), keyed by layer name.
    negatives: dict[str, list[NegativeTest]] = {}
    neg_unreachable: list[Unreachable] = []
    if invalid:
        for layer in layers:
            negs, unreach = build_negative_tests(
                layer, max_cycle_unroll=max_cycle_unroll
            )
            negatives[layer.name] = negs
            neg_unreachable.extend(unreach)

    tests = _assign_test_ids(layer_results, negatives)
    coverage = _build_coverage_rows(layer_results, tests, n, negatives)
    uncovered = [
        u for lr in layer_results for u in lr.unreachable
    ] + neg_unreachable
    return GenerationResult(
        tests=tests,
        coverage=coverage,
        uncovered=uncovered,
        layers=[lr.layer.name for lr in layer_results],
    )


# ---------- test cases ----------


def _assign_test_ids(
    layer_results: list[LayerResult],
    negatives: dict[str, list[NegativeTest]],
) -> list[TestCase]:
    """Order tests by (layer order, positive then negative) and materialize rows."""
    out: list[TestCase] = []
    # Layers sort: top first, then composite names alphabetically.
    ordered = sorted(
        layer_results,
        key=lambda lr: (0 if lr.layer.name == "top" else 1, lr.layer.name),
    )
    for lr in ordered:
        for idx, tp in enumerate(lr.tests, start=1):
            out.append(
                TestCase(
                    test_id=f"{lr.layer.name}-{idx:03d}",
                    kind="positive",
                    layer=lr.layer.name,
                    length=len(tp.transitions),
                    start=tp.start,
                    sequence="|".join(_event_token(t) for t in tp.transitions),
                    end=tp.end,
                    inject="",
                    expect="",
                    covers=";".join(transition_str(t) for t in tp.transitions),
                )
            )
        # Negative tests continue from a distinct hundreds block (§6.1) so
        # positive and negative ids never collide.
        for idx, nt in enumerate(negatives.get(lr.layer.name, ()), start=101):
            out.append(
                TestCase(
                    test_id=f"{lr.layer.name}-{idx:03d}",
                    kind="negative",
                    layer=lr.layer.name,
                    length=len(nt.prefix),
                    start=lr.layer.initial_id,
                    sequence="|".join(_event_token(t) for t in nt.prefix),
                    end=nt.source_state,
                    inject=nt.inject_event,
                    expect="no-transition",
                    covers=f"{nt.source_state}--{nt.inject_event}--x",
                )
            )
    return out


def _event_token(t: Transition) -> str:
    ev = t.event if t.event else "()"
    g = f"[{t.guard}]" if t.guard else ""
    a = f"/{t.action}" if t.action else ""
    return f"{ev}{g}{a}"


# ---------- coverage ----------


def _build_coverage_rows(
    layer_results: list[LayerResult],
    tests: list[TestCase],
    n: int,
    negatives: dict[str, list[NegativeTest]],
) -> list[CoverageRow]:
    kind = "transition" if n == 0 else "chain"
    rows: list[CoverageRow] = []

    test_ids_in_order = [tc.test_id for tc in tests]

    # For each layer, compute required chains and mark which tests cover
    # which chains.
    for lr in layer_results:
        chains = required_chains(lr.layer, n)
        layer_tests = [tc for tc in tests if tc.layer == lr.layer.name]
        for c in chains:
            cs = chain_str(c, lr.layer.initial_id)
            row = CoverageRow(kind=kind, layer=lr.layer.name, element=cs)
            hits: dict[str, str] = {tid: "" for tid in test_ids_in_order}
            first_adopter: str | None = None
            for tc in layer_tests:
                if _test_covers_chain(tc, c):
                    if first_adopter is None:
                        hits[tc.test_id] = "#"
                        first_adopter = tc.test_id
                    else:
                        hits[tc.test_id] = "x"
            row.hits = hits
            # Flag chains the builder reported as unreachable.
            for u in lr.unreachable:
                if u.chain == c:
                    row.status = "unreachable-within-cap"
                    row.reason = u.reason
                    break
            rows.append(row)

    # Invalid-transition coverage rows (§6.2): one per invalid cell, marked
    # covered by its negative test.
    for lr in layer_results:
        neg_id_by_element = {
            tc.covers: tc.test_id
            for tc in tests
            if tc.layer == lr.layer.name and tc.kind == "negative"
        }
        for nt in negatives.get(lr.layer.name, []):
            element = f"{nt.source_state}--{nt.inject_event}--x"
            hits = {tid: "" for tid in test_ids_in_order}
            tid = neg_id_by_element.get(element)
            if tid is not None:
                hits[tid] = "#"
            rows.append(
                CoverageRow(
                    kind="invalid-transition",
                    layer=lr.layer.name,
                    element=element,
                    hits=hits,
                )
            )

    rows.sort(key=lambda r: (r.kind, r.layer, r.element))
    return rows


def _test_covers_chain(tc: TestCase, chain: Chain) -> bool:
    # Rebuild a chain-string from tc.covers and look for the target as a
    # contiguous subsequence. Use the covers column since it contains the
    # canonical transition ids.
    target = [
        f"{t.source_state_id}--{t.event or '()'}-->{t.target_state_id}"
        for t in chain
    ]
    path = tc.covers.split(";")
    for i in range(len(path) - len(target) + 1):
        if path[i : i + len(target)] == target:
            return True
    return False


# ---------- CSV emitters ----------


def tests_to_csv(tests: list[TestCase]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(
        [
            "test_id", "kind", "layer", "length", "start",
            "sequence", "end", "inject", "expect", "covers",
        ]
    )
    for tc in tests:
        writer.writerow(
            [
                tc.test_id, tc.kind, tc.layer, tc.length, tc.start,
                tc.sequence, tc.end, tc.inject, tc.expect, tc.covers,
            ]
        )
    return buf.getvalue()


def coverage_to_csv(rows: list[CoverageRow], tests: list[TestCase]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    headers = ["kind", "layer", "element", *[tc.test_id for tc in tests], "status", "reason"]
    writer.writerow(headers)
    for row in rows:
        cells = [row.hits.get(tc.test_id, "") for tc in tests]
        writer.writerow(
            [row.kind, row.layer, row.element, *cells, row.status, row.reason]
        )
    return buf.getvalue()


def result_to_dict(result: GenerationResult) -> dict:
    """Serialize a GenerationResult as plain dict (for library users)."""
    return {
        "tests": [asdict(tc) for tc in result.tests],
        "coverage": [asdict(row) for row in result.coverage],
        "uncovered": [
            {
                "layer": u.layer_name,
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
        "layers": result.layers,
    }


__all__ = [
    "TestCase",
    "CoverageRow",
    "GenerationResult",
    "generate",
    "tests_to_csv",
    "coverage_to_csv",
    "result_to_dict",
    "TestPath",
    "Unreachable",
]
