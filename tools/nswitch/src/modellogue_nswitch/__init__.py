"""modellogue-nswitch — N-switch coverage test case generator.

Public API (see Requirements_Specification.md §9):

    from modellogue_nswitch import generate, parse_puml, parse_csv
"""
from .model import (
    State,
    StateType,
    Transition,
    StateMachineModel,
)
from .parse_puml import parse_puml
from .parse_csv import parse_csv
from .generate import generate, GenerationResult, Test, Scenario, Step, Precondition

__all__ = [
    "State",
    "StateType",
    "Transition",
    "StateMachineModel",
    "parse_puml",
    "parse_csv",
    "generate",
    "GenerationResult",
    "Test",
    "Scenario",
    "Step",
    "Precondition",
]

__version__ = "0.2.0"
