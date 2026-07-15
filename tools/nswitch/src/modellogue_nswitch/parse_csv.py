"""Parse the canonical state-transition-table CSV into StateMachineModel.

Format spec: Requirements_Specification.md §4.2.
"""
from __future__ import annotations

import csv
import io
import re

from .model import State, StateMachineModel, Transition


class CsvParseError(ValueError):
    """Raised when the input is not a valid canonical transition-table CSV."""


REQUIRED_COLUMNS = ("state", "label", "parent", "type", "initial")

# §4.2.2: an event cell saying "no transition". Writers emit `-`; readers take
# the field, because the table may have been authored in a spreadsheet or by
# another MBT tool that marks forbidden cells its own way. Empty is included:
# it is the pre-v8.1 canonical form and must keep parsing forever.
#
# Compared case-insensitively against the trimmed cell. A marker is only ever a
# WHOLE cell — see _split_semicolons callers: `t1; -; t2` is an error, not a
# marker, because a cell cannot both have and not have transitions.
_NO_TRANSITION_MARKERS = frozenset(
    {
        "",  # pre-v8.1 canonical
        "-",  # canonical (U+002D)
        "—",  # em dash — spreadsheet autocorrect turns `-` into this
        "–",  # en dash — ditto
        "×",  # × multiplication sign
        "x",
        "n/a",
        "na",
    }
)


def _is_no_transition(cell: str) -> bool:
    """True when an event cell means "this transition is forbidden" (§4.2.2)."""
    return cell.strip().casefold() in _NO_TRANSITION_MARKERS
_INITIAL_CELL = re.compile(
    r"^Y(?:\s*\[([^\]]*)\])?(?:\s*/\s*(.+))?$"
)
# An event cell token: <target> [ [guard] ] [ / action ]
# target is a state id (word characters or literal [*]).
_EVENT_CELL = re.compile(
    r"""
    ^
    (?P<target>
        \[\*\] | [^\[/;]+?
    )
    (?:\s*\[(?P<guard>[^\]]*)\])?
    (?:\s*/\s*(?P<action>.+))?
    $
    """,
    re.VERBOSE,
)


def parse_csv(text: str) -> StateMachineModel:
    reader = csv.reader(io.StringIO(text), strict=True)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise CsvParseError("CSV is empty")

    header = [h.strip() for h in rows[0]]
    _validate_header(header)

    # Split the header into fixed + event columns, honoring the §4.2.5 rule
    # that the first five must be matched by name (so a reordered column
    # still works) — writers MUST emit them in order, but readers accept
    # any order.
    name_to_idx = {name: i for i, name in enumerate(header)}
    fixed_idx = {name: name_to_idx[name] for name in REQUIRED_COLUMNS}
    event_cols = [
        (h, i) for i, h in enumerate(header) if h not in REQUIRED_COLUMNS
    ]
    events = [name for name, _ in event_cols]

    # First pass: build states.
    state_rows: list[tuple[dict[str, str], list[str]]] = []
    for row_num, row in enumerate(rows[1:], start=2):
        if len(row) < len(header):
            row = row + [""] * (len(header) - len(row))
        fixed = {name: row[idx].strip() for name, idx in fixed_idx.items()}
        event_values = [row[i] for _, i in event_cols]
        if not fixed["state"]:
            raise CsvParseError(f"row {row_num}: empty `state` column")
        if fixed["type"] not in ("normal", "composite"):
            raise CsvParseError(
                f"row {row_num}: `type` must be 'normal' or 'composite' "
                f"(got '{fixed['type']}')"
            )
        state_rows.append((fixed, event_values))

    # Reject duplicate ids and nested composites.
    ids = {f["state"] for f, _ in state_rows}
    if len(ids) != len(state_rows):
        dup = _first_duplicate([f["state"] for f, _ in state_rows])
        raise CsvParseError(f"duplicate `state` id: {dup}")

    id_to_type = {f["state"]: f["type"] for f, _ in state_rows}
    for f, _ in state_rows:
        p = f["parent"]
        if not p:
            continue
        if p not in id_to_type:
            raise CsvParseError(
                f"state '{f['state']}' has unknown parent '{p}'"
            )
        if id_to_type[p] != "composite":
            raise CsvParseError(
                f"state '{f['state']}' parent '{p}' is not marked as composite"
            )
        # one-level-of-nesting check (ADR-009): the parent itself must be top-level.
        parent_row = next(pr for pr, _ in state_rows if pr["state"] == p)
        if parent_row["parent"]:
            raise CsvParseError(
                f"nested composite rejected: '{p}' has its own parent "
                f"'{parent_row['parent']}' (ADR-009 forbids >1 levels)"
            )

    # Build real states.
    real_states: list[State] = []
    for fixed, _ in state_rows:
        label = fixed["label"] or fixed["state"]
        real_states.append(
            State(
                id=fixed["state"],
                label=label,
                type=fixed["type"],  # type: ignore[arg-type]
                parent_id=fixed["parent"] or None,
            )
        )

    # Per-layer (one top + one per composite) initial and final pseudo-states
    # are synthesized on demand.
    model = StateMachineModel(states=list(real_states), events=list(events))

    # Identify one initial target per layer from the `initial` column.
    # The layer key is the parent_id (None for top).
    initial_by_layer: dict[str | None, tuple[str, str | None, str | None]] = {}
    for fixed, _ in state_rows:
        raw = fixed["initial"].strip()
        if not raw:
            continue
        m = _INITIAL_CELL.match(raw)
        if not m:
            raise CsvParseError(
                f"state '{fixed['state']}': invalid `initial` cell "
                f"'{raw}' (expected Y | Y [guard] | Y / action | "
                f"Y [guard] / action)"
            )
        layer = fixed["parent"] or None
        if layer in initial_by_layer:
            raise CsvParseError(
                f"multiple initial targets in layer "
                f"{'top' if layer is None else layer!r}"
            )
        guard = m.group(1).strip() if m.group(1) else None
        action = m.group(2).strip() if m.group(2) else None
        initial_by_layer[layer] = (fixed["state"], guard, action)

    # Synthesize initial / final pseudo-states and their transitions.
    transitions: list[Transition] = []

    # Determine which layers need a final pseudo-state: any cell that contains
    # a `[*]` target in that layer. We'll scan event cells below and synthesize
    # finals as we see them.
    final_ids_per_layer: dict[str | None, str] = {}

    def final_for(layer: str | None) -> str:
        if layer not in final_ids_per_layer:
            final_ids_per_layer[layer] = (
                "[*]_final" if layer is None else f"[*]_final_{layer}"
            )
        return final_ids_per_layer[layer]

    # Second pass: event cells → transitions.
    for (fixed, event_values) in state_rows:
        source = fixed["state"]
        source_layer = fixed["parent"] or None
        for ev_name, raw_cell in zip(events, event_values):
            raw_cell = raw_cell.strip()
            # §4.2.2: `-` (and the markers a foreign table may use, and the
            # pre-v8.1 empty cell) all mean the same thing — no transition, so
            # nothing to emit. The absence IS the negative Test; §7.2 derives
            # the INV cases from the (state, event) pairs missing here.
            if _is_no_transition(raw_cell):
                continue
            for piece in _split_semicolons(raw_cell):
                piece = piece.strip()
                if not piece:
                    continue
                target, guard, action = _parse_event_cell(piece, source, ev_name)
                if target == "[*]":
                    target_id = final_for(source_layer)
                else:
                    if target not in id_to_type:
                        raise CsvParseError(
                            f"state '{source}' event '{ev_name}': "
                            f"target '{target}' is not a declared state"
                        )
                    target_id = target
                transitions.append(
                    Transition(
                        source_state_id=source,
                        target_state_id=target_id,
                        event=ev_name,
                        guard=guard,
                        action=action,
                    )
                )

    # Synthesize per-layer initial pseudo-states and their outgoing transitions
    # (events=None, with optional guard/action captured from the `initial` cell).
    initial_ids_per_layer: dict[str | None, str] = {}
    for layer, (target, guard, action) in initial_by_layer.items():
        init_id = "[*]_init" if layer is None else f"[*]_init_{layer}"
        initial_ids_per_layer[layer] = init_id
        model.states.append(
            State(
                id=init_id,
                label="[*]",
                type="initial",
                parent_id=layer,
            )
        )
        transitions.append(
            Transition(
                source_state_id=init_id,
                target_state_id=target,
                event=None,
                guard=guard,
                action=action,
            )
        )

    # Now materialize the final pseudo-states we saw.
    for layer, fid in final_ids_per_layer.items():
        model.states.append(
            State(id=fid, label="[*]", type="final", parent_id=layer)
        )

    model.transitions = transitions
    return model


def _validate_header(header: list[str]) -> None:
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise CsvParseError(
            f"missing required column(s): {', '.join(missing)}"
        )


def _first_duplicate(items: list[str]) -> str:
    seen: set[str] = set()
    for x in items:
        if x in seen:
            return x
        seen.add(x)
    return ""


def _split_semicolons(cell: str) -> list[str]:
    """Split on `;` that is NOT inside a bracket or paren."""
    out: list[str] = []
    depth_bracket = 0
    depth_paren = 0
    buf: list[str] = []
    for ch in cell:
        if ch == "[":
            depth_bracket += 1
        elif ch == "]":
            depth_bracket = max(0, depth_bracket - 1)
        elif ch == "(":
            depth_paren += 1
        elif ch == ")":
            depth_paren = max(0, depth_paren - 1)
        if ch == ";" and depth_bracket == 0 and depth_paren == 0:
            out.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    out.append("".join(buf))
    return out


def _parse_event_cell(
    piece: str, source: str, ev: str
) -> tuple[str, str | None, str | None]:
    m = _EVENT_CELL.match(piece)
    if not m:
        raise CsvParseError(
            f"state '{source}' event '{ev}': cannot parse cell value '{piece}'"
        )
    target = m.group("target").strip()
    guard = m.group("guard").strip() if m.group("guard") else None
    action = m.group("action").strip() if m.group("action") else None
    if not target:
        raise CsvParseError(
            f"state '{source}' event '{ev}': empty target in '{piece}'"
        )
    return target, guard, action
