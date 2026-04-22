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
    composites = [s for s in model.states if s.type == "composite"]
    top = _build_top_layer(model, composites, opaque_composites=layered)
    if not layered:
        return [top]
    child_layers = [_build_child_layer(model, c) for c in composites]
    return [top, *child_layers]


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
