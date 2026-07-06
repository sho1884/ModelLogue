"""Layered decomposition per Requirements_Specification.md §7.1.

One top layer + one child layer per composite state. Each layer carries
its real (non-pseudo) states plus two canonical pseudo-state ids
(``[*]_init`` / ``[*]_final`` at the top layer, ``[*]_init_X`` /
``[*]_final_X`` per child). All transitions are rewritten so their
endpoints use the canonical layer-local ids — algorithms downstream can
treat the layer as a self-contained state machine.
"""
from __future__ import annotations

from dataclasses import dataclass

from .model import State, StateMachineModel, Transition


@dataclass(frozen=True, slots=True)
class Layer:
    name: str  # "top" or the composite state id
    composite_id: str | None  # None for the top layer
    states: tuple[State, ...]  # real (non-pseudo) states in this layer
    initial_id: str  # canonical pseudo-state id
    final_id: str  # canonical pseudo-state id
    # Transitions whose endpoints are in this layer, rewritten so that the
    # parser-emitted pseudo-state ids are mapped to the canonical ones.
    transitions: tuple[Transition, ...]

    def all_node_ids(self) -> list[str]:
        ids = [s.id for s in self.states]
        ids.append(self.initial_id)
        ids.append(self.final_id)
        return ids


def decompose(model: StateMachineModel, *, layered: bool = True) -> list[Layer]:
    """Return the layers to generate tests over.

    Composites are **flattened** (inlined one level) into a single layer so
    coverage is complete and independent of how the model was drawn — a
    composite model and its hand-flattened equivalent yield the same tests.
    Layered testing (a composite as a black box + its internals separately)
    silently drops boundary-crossing sequences, thinning coverage, so it is not
    used for generation (ADR-009 revision). The ``layered`` flag is retained for
    signature stability but no longer splits the machine.
    """
    return [_build_flat_layer(model)]


def _build_flat_layer(model: StateMachineModel) -> Layer:
    """Flatten one level of composites into a single self-contained layer.

    Mechanical expansion:
      - a composite's children are promoted to the top level (the composite
        node itself disappears);
      - an **entry** into a composite (``X --> C``) is redirected to C's
        internal initial child;
      - a **group-escape** from a composite (``C --ev--> Y``) is replicated
        from **every** child of C (``child --ev--> Y``);
      - internal transitions are kept as-is;
      - the composite's internal initial transition is dropped (folded into the
        entry redirect); a transition into a composite's internal final maps to
        the machine's final marker.
    """
    initial_id = "[*]_init"
    final_id = "[*]_final"

    top_initial_src = next(
        (s.id for s in model.states if s.type == "initial" and s.parent_id is None),
        None,
    )
    top_final_src = next(
        (s.id for s in model.states if s.type == "final" and s.parent_id is None),
        None,
    )
    rename: dict[str, str] = {}
    if top_initial_src is not None:
        rename[top_initial_src] = initial_id
    if top_final_src is not None:
        rename[top_final_src] = final_id

    composites = [s for s in model.states if s.type == "composite"]
    composite_ids = {c.id for c in composites}
    children_of: dict[str, list[str]] = {
        c.id: [s.id for s in model.states if s.parent_id == c.id and s.type == "normal"]
        for c in composites
    }
    # Each composite's internal-initial target (the child its `[*] -->` points to).
    entry_of: dict[str, str] = {}
    for c in composites:
        start_id = f"__start_of_{c.id}__"
        t = next((t for t in model.transitions if t.source_state_id == start_id), None)
        if t is not None:
            entry_of[c.id] = t.target_state_id
        elif children_of[c.id]:
            entry_of[c.id] = children_of[c.id][0]
    internal_final_ids = {f"__end_of_{c.id}__" for c in composites}

    # Flat layer states: every NORMAL state (children promoted); no composites,
    # no internal pseudo-states.
    real_states = tuple(s for s in model.states if s.type == "normal")

    def resolve_target(tid: str) -> str:
        if tid in composite_ids:
            return entry_of.get(tid, tid)
        if tid in internal_final_ids:
            return final_id
        return rename.get(tid, tid)

    kept: list[Transition] = []
    seen: set[tuple] = set()

    def emit(src: str, tgt: str, t: Transition) -> None:
        key = (src, tgt, t.event, t.guard, t.action)
        if key in seen:
            return
        seen.add(key)
        kept.append(
            Transition(
                source_state_id=src,
                target_state_id=tgt,
                event=t.event,
                guard=t.guard,
                action=t.action,
            )
        )

    for t in model.transitions:
        src = t.source_state_id
        if src.startswith("__start_of_"):
            continue  # internal-initial edge — folded into the entry redirect
        tgt = resolve_target(t.target_state_id)
        if src in composite_ids:
            # group-escape: fires from any internal state
            for child in children_of[src]:
                emit(child, tgt, t)
        else:
            emit(rename.get(src, src), tgt, t)

    return Layer(
        name="top",
        composite_id=None,
        states=real_states,
        initial_id=initial_id,
        final_id=final_id,
        transitions=tuple(kept),
    )


def _build_top_layer(
    model: StateMachineModel,
    composites: list[State],
    *,
    opaque_composites: bool,
) -> Layer:
    # Every state whose parent is None, excluding pseudo-states, is a
    # top-layer "real" node. Composites participate as black-box nodes
    # regardless of ``opaque_composites`` (that flag controls whether
    # child layers are also generated, not the top layer's shape).
    real_states = tuple(
        s
        for s in model.states
        if s.parent_id is None and s.type in ("normal", "composite")
    )

    initial_id = "[*]_init"
    final_id = "[*]_final"

    # Map parser-emitted top-level pseudo-state ids onto the canonical ones.
    top_initial_src_id: str | None = next(
        (s.id for s in model.states if s.type == "initial" and s.parent_id is None),
        None,
    )
    top_final_src_id: str | None = next(
        (s.id for s in model.states if s.type == "final" and s.parent_id is None),
        None,
    )
    rename: dict[str, str] = {}
    if top_initial_src_id is not None:
        rename[top_initial_src_id] = initial_id
    if top_final_src_id is not None:
        rename[top_final_src_id] = final_id

    allowed = {s.id for s in real_states} | {initial_id, final_id}

    kept: list[Transition] = []
    for t in model.transitions:
        src_id = rename.get(t.source_state_id, t.source_state_id)
        tgt_id = rename.get(t.target_state_id, t.target_state_id)
        if src_id not in allowed or tgt_id not in allowed:
            continue
        kept.append(
            Transition(
                source_state_id=src_id,
                target_state_id=tgt_id,
                event=t.event,
                guard=t.guard,
                action=t.action,
            )
        )

    return Layer(
        name="top",
        composite_id=None,
        states=real_states,
        initial_id=initial_id,
        final_id=final_id,
        transitions=tuple(kept),
    )


def _build_child_layer(model: StateMachineModel, composite: State) -> Layer:
    children = tuple(
        s
        for s in model.states
        if s.parent_id == composite.id and s.type in ("normal", "composite")
    )
    init_id = f"[*]_init_{composite.id}"
    final_id = f"[*]_final_{composite.id}"

    # Parser synthesizes unique pseudo-state ids for composite internals.
    # Reader of parse_csv uses the same scheme.
    rename = {
        f"__start_of_{composite.id}__": init_id,
        f"__end_of_{composite.id}__": final_id,
    }

    allowed = {c.id for c in children} | {init_id, final_id}

    kept: list[Transition] = []
    for t in model.transitions:
        src_id = rename.get(t.source_state_id, t.source_state_id)
        tgt_id = rename.get(t.target_state_id, t.target_state_id)
        if src_id not in allowed or tgt_id not in allowed:
            continue
        kept.append(
            Transition(
                source_state_id=src_id,
                target_state_id=tgt_id,
                event=t.event,
                guard=t.guard,
                action=t.action,
            )
        )

    return Layer(
        name=composite.id,
        composite_id=composite.id,
        states=children,
        initial_id=init_id,
        final_id=final_id,
        transitions=tuple(kept),
    )
