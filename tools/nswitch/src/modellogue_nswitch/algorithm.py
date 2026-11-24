"""Path-algebra matrix and test case construction.

Implements §7.2 (matrix power over a set-of-sequences semiring) and §7.4
(greedy test case construction with cycle-closure fallback) of
``Requirements_Specification.md``.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field

from .layers import Layer
from .model import Transition


# A chain is a tuple of transitions. Since Transition is a frozen dataclass
# with slots, it is hashable — chains can live in sets.
Chain = tuple[Transition, ...]


def required_chains(layer: Layer, n: int) -> list[Chain]:
    """Return Required[layer] per §7.2 for N ∈ {0, 1, 2}.

    Every chain of length exactly ``n + 1`` that can be formed by composing
    transitions of ``layer``.
    """
    if n not in (0, 1, 2):
        raise ValueError(f"n must be 0, 1, or 2 (got {n})")
    a = _build_a(layer)
    power = a
    for _ in range(n):
        power = _matmul(power, a)
    chains: set[Chain] = set()
    for _i, row in power.items():
        for _j, cell in row.items():
            chains.update(cell)
    return _sort_chains(chains)


# ---------- matrix ----------

Matrix = dict[str, dict[str, set[Chain]]]


def _build_a(layer: Layer) -> Matrix:
    m: Matrix = defaultdict(lambda: defaultdict(set))
    for t in layer.transitions:
        m[t.source_state_id][t.target_state_id].add((t,))
    return m


def _matmul(a: Matrix, b: Matrix) -> Matrix:
    out: Matrix = defaultdict(lambda: defaultdict(set))
    for i, row in a.items():
        for k, ak in row.items():
            b_row = b.get(k)
            if not b_row:
                continue
            for j, bkj in b_row.items():
                # Concatenate-and-union: ak ⊗ bkj
                for s_a in ak:
                    for s_b in bkj:
                        out[i][j].add(s_a + s_b)
    return out


# ---------- test construction ----------


@dataclass(slots=True)
class TestPath:
    layer_name: str
    # The full path's transitions (p1 · c · p2).
    transitions: tuple[Transition, ...]
    start: str
    end: str
    # The required chain this test was built around.
    anchor: Chain
    # True when the path terminates by revisiting a state rather than reaching
    # the layer's final pseudo-state.
    closed_on_cycle: bool


@dataclass(slots=True)
class Unreachable:
    layer_name: str
    chain: Chain
    reason: str


@dataclass(slots=True)
class NegativeTest:
    """A robustness test for one invalid transition (§7.2 / §7.4).

    Reaches ``source_state`` via ``prefix`` from the layer's initial
    pseudo-state, then injects ``inject_event`` — which has no valid
    transition out of ``source_state`` — and asserts no state change.
    """

    layer_name: str
    prefix: tuple[Transition, ...]  # path initial -> source_state
    source_state: str
    inject_event: str


@dataclass(slots=True)
class LayerResult:
    layer: Layer
    tests: list[TestPath] = field(default_factory=list)
    unreachable: list[Unreachable] = field(default_factory=list)


def build_tests(
    layer: Layer,
    n: int,
    *,
    require_final: bool,
) -> LayerResult:
    """Construct a cover of Required[layer] per §7.4.

    Greedy path cover. Not minimum (NP-hard) but deterministic.
    """
    result = LayerResult(layer=layer)

    final_reachable = _any_path(
        layer,
        layer.initial_id,
        {layer.final_id},
    ) is not None

    if require_final and not final_reachable:
        # Signal unsatisfiable by surfacing every chain; CLI turns this into
        # exit code 2.
        for c in required_chains(layer, n):
            result.unreachable.append(
                Unreachable(
                    layer_name=layer.name,
                    chain=c,
                    reason="--require-final: no initial→final path exists",
                )
            )
        return result

    chains = required_chains(layer, n)
    covered: set[Chain] = set()
    for c in chains:
        if c in covered:
            continue
        p1 = _shortest_path(
            layer,
            layer.initial_id,
            {c[0].source_state_id},
            allow_empty=True,
        )
        if p1 is None:
            result.unreachable.append(
                Unreachable(
                    layer_name=layer.name,
                    chain=c,
                    reason="chain head is unreachable from the initial state",
                )
            )
            continue

        tail_start = c[-1].target_state_id
        # Try final-reaching suffix first.
        closed_on_cycle = False
        p2: tuple[Transition, ...] | None = None
        if final_reachable:
            p2 = _shortest_path(
                layer,
                tail_start,
                {layer.final_id},
                # When the tail is already at a final, the empty suffix is valid.
                allow_empty=True,
            )
        if p2 is None:
            # Fallback: cycle closure. Any suffix that revisits a state the
            # path has seen counts as a loop closure.
            visited = _visited_states(p1 + c, layer.initial_id)
            p2 = _shortest_path(
                layer,
                tail_start,
                visited,
                allow_empty=True,
            )
            if p2 is None:
                result.unreachable.append(
                    Unreachable(
                        layer_name=layer.name,
                        chain=c,
                        reason="no final-reaching or cycle-closing continuation",
                    )
                )
                continue
            closed_on_cycle = True

        full = p1 + c + p2
        end_id = _end_state_of(full, layer.initial_id)
        result.tests.append(
            TestPath(
                layer_name=layer.name,
                transitions=full,
                start=layer.initial_id,
                end=end_id,
                anchor=c,
                closed_on_cycle=closed_on_cycle,
            )
        )
        # Mark every length-(n+1) subchain of the emitted path as covered,
        # so future iterations skip chains already exercised.
        chain_len = len(c)
        for i in range(len(full) - chain_len + 1):
            covered.add(tuple(full[i : i + chain_len]))

    return result


# ---------- negative tests (invalid transitions, §7.2) ----------


def _event_alphabet(layer: Layer) -> list[str]:
    """Sorted set of real event names on the layer's transitions.

    Excludes the synthetic `()` init/final events (event is None/empty).
    """
    seen: set[str] = {t.event for t in layer.transitions if t.event}
    return sorted(seen)


def invalid_cells(layer: Layer) -> list[tuple[str, str]]:
    """Empty state-table cells: `(state_id, event)` with no transition.

    For every real (non-pseudo) state and every event in the alphabet,
    a cell is invalid iff no transition leaves that state on that event.
    Deterministically sorted by `(state_id, event)`.
    """
    alphabet = _event_alphabet(layer)
    valid: set[tuple[str, str]] = {
        (t.source_state_id, t.event)
        for t in layer.transitions
        if t.event
    }
    cells = [
        (s.id, e)
        for s in layer.states
        for e in alphabet
        if (s.id, e) not in valid
    ]
    cells.sort()
    return cells


def build_negative_tests(
    layer: Layer,
) -> tuple[list[NegativeTest], list[Unreachable]]:
    """One negative test per invalid cell whose source state is reachable."""
    tests: list[NegativeTest] = []
    unreachable: list[Unreachable] = []
    for state_id, event in invalid_cells(layer):
        prefix = _shortest_path(
            layer,
            layer.initial_id,
            {state_id},
            allow_empty=True,
        )
        if prefix is None:
            unreachable.append(
                Unreachable(
                    layer_name=layer.name,
                    chain=(),
                    reason=(
                        f"invalid cell {state_id}--{event}--x: "
                        "source state is unreachable from the initial state"
                    ),
                )
            )
            continue
        tests.append(
            NegativeTest(
                layer_name=layer.name,
                prefix=prefix,
                source_state=state_id,
                inject_event=event,
            )
        )
    return tests, unreachable


def _visited_states(transitions: tuple[Transition, ...], start: str) -> set[str]:
    """All state ids seen along ``transitions`` starting at ``start``."""
    seen = {start}
    for t in transitions:
        seen.add(t.target_state_id)
    return seen


def _end_state_of(transitions: tuple[Transition, ...], start: str) -> str:
    if not transitions:
        return start
    return transitions[-1].target_state_id


# ---------- path finding ----------


def _any_path(
    layer: Layer,
    source: str,
    targets: set[str],
) -> tuple[Transition, ...] | None:
    return _shortest_path(layer, source, targets, allow_empty=True)


def _shortest_path(
    layer: Layer,
    source: str,
    targets: set[str],
    *,
    allow_empty: bool = False,
) -> tuple[Transition, ...] | None:
    """Breadth-first shortest path in the transition graph (§7.3).

    Returns the path as a tuple of transitions, or ``None`` if no state in
    ``targets`` is reachable. If ``source in targets`` and ``allow_empty`` is
    True, returns an empty tuple. A shortest path never takes a transition
    twice, so the search visits each state at most once and its cost is
    proportional to the number of states and transitions.
    """
    if allow_empty and source in targets:
        return ()

    adj: dict[str, list[Transition]] = defaultdict(list)
    for t in layer.transitions:
        adj[t.source_state_id].append(t)

    # parent[state] = transition that first reached it (BFS tree).
    parent: dict[str, Transition | None] = {source: None}
    queue: deque[str] = deque([source])
    while queue:
        node = queue.popleft()
        for t in adj.get(node, ()):
            nxt = t.target_state_id
            if nxt in targets:
                path = [t]
                cur = node
                while parent[cur] is not None:
                    step = parent[cur]
                    path.append(step)
                    cur = step.source_state_id
                return tuple(reversed(path))
            if nxt not in parent:
                parent[nxt] = t
                queue.append(nxt)
    return None


# ---------- ordering ----------


def chain_str(chain: Chain, initial_id: str) -> str:
    """Canonical string for a chain per §7.5.

    ``<src0> --<event0>--> <tgt0> --<event1>--> ...``
    """
    if not chain:
        return ""
    parts = [chain[0].source_state_id]
    for t in chain:
        ev = t.event if t.event else "()"
        parts.append(f"--{ev}-->")
        parts.append(t.target_state_id)
    return " ".join(parts)


def transition_str(t: Transition) -> str:
    ev = t.event if t.event else "()"
    return f"{t.source_state_id}--{ev}-->{t.target_state_id}"


def _sort_chains(chains: set[Chain]) -> list[Chain]:
    """Sort by descending length then by canonical chain string (§7.4)."""
    # All chains here share length N+1; the length key is a no-op but kept for
    # robustness if we ever mix lengths.
    return sorted(
        chains,
        key=lambda c: (-len(c), tuple(transition_str(t) for t in c)),
    )
