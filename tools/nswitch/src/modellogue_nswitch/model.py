"""Canonical internal representation of a state machine.

Mirrors src/types/stateMachine.ts in the ModelLogue TypeScript codebase:
two independent implementations of the same model. Equivalence is
enforced by a shared golden-input corpus (see tests/).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

StateType = Literal["normal", "composite", "initial", "final"]


@dataclass(frozen=True, slots=True)
class State:
    id: str
    label: str
    type: StateType
    parent_id: str | None


@dataclass(frozen=True, slots=True)
class Transition:
    source_state_id: str
    target_state_id: str
    event: str | None
    guard: str | None
    action: str | None


@dataclass(slots=True)
class StateMachineModel:
    states: list[State] = field(default_factory=list)
    transitions: list[Transition] = field(default_factory=list)
    # Deduplicated list of event names in discovery order.
    events: list[str] = field(default_factory=list)

    def state_by_id(self, sid: str) -> State | None:
        for s in self.states:
            if s.id == sid:
                return s
        return None
