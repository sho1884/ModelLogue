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
    TestPath,
    Unreachable,
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
    layer: str
    length: int
    start: str
    sequence: str
    end: str
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

    tests = _assign_test_ids(layer_results)
    coverage = _build_coverage_rows(layer_results, tests, n)
    uncovered = [u for lr in layer_results for u in lr.unreachable]
    return GenerationResult(
        tests=tests,
        coverage=coverage,
        uncovered=uncovered,
        layers=[lr.layer.name for lr in layer_results],
    )


# ---------- test cases ----------


def _assign_test_ids(layer_results: list[LayerResult]) -> list[TestCase]:
    """Order tests by (layer order, seq) and materialize the CSV rows."""
    out: list[TestCase] = []
    # Layers sort: top first, then composite names alphabetically.
    ordered = sorted(
        layer_results,
        key=lambda lr: (0 if lr.layer.name == "top" else 1, lr.layer.name),
    )
    for lr in ordered:
        for idx, tp in enumerate(lr.tests, start=1):
            test_id = f"{lr.layer.name}-{idx:03d}"
            sequence = "|".join(_event_token(t) for t in tp.transitions)
            covers = ";".join(transition_str(t) for t in tp.transitions)
            out.append(
                TestCase(
                    test_id=test_id,
                    layer=lr.layer.name,
                    length=len(tp.transitions),
                    start=tp.start,
                    sequence=sequence,
                    end=tp.end,
                    covers=covers,
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
    writer.writerow(["test_id", "layer", "length", "start", "sequence", "end", "covers"])
    for tc in tests:
        writer.writerow(
            [tc.test_id, tc.layer, tc.length, tc.start, tc.sequence, tc.end, tc.covers]
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
