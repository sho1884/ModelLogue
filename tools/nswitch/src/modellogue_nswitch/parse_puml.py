"""PlantUML subset parser.

Conforms to the EBNF in ``src/grammars/stateDiagram.ebnf`` in the
ModelLogue repository. Independent Python re-implementation of the
TypeScript parser at ``src/parsers/stateMachineParser.ts``.

ADR-009 one-level composite constraint: nested composites, orthogonal
regions, history pseudo-states, and dot-notation entry are rejected.
"""
from __future__ import annotations

import re

from .model import State, StateMachineModel, Transition

INITIAL_STATE_ID = "[*]"

# Identifier: ASCII word chars plus CJK ranges that the TS parser supports
# (U+3040 Hiragana through U+9FFF CJK Unified Ideographs).
_ID = r"[\w぀-鿿]+"
_PSEUDO_OR_ID = rf"(?:\[\*\]|{_ID})"

TRANSITION_PATTERN = re.compile(
    rf"^(?P<src>{_PSEUDO_OR_ID})\s*(?:-->|->)\s*"
    rf"(?P<tgt>{_PSEUDO_OR_ID})(?:\s*:\s*(?P<label>.+))?$"
)

# Label of an initial transition: action only (`/ action`).
INITIAL_LABEL_PATTERN = re.compile(r"^/\s*(?P<action>\S.*)$")
INITIAL_LABEL_ERROR = (
    "initial transition cannot have an event or guard; "
    "only an action is allowed ([*] --> X : / action)"
)

COMPOSITE_OPEN_PATTERN = re.compile(
    rf'^state\s+(?:"(?P<label>[^"]+)"\s+as\s+)?(?P<alias>{_ID})\s*\{{\s*$'
)

STATE_ALIAS_PATTERN = re.compile(
    rf'^state\s+"(?P<label>[^"]+)"\s+as\s+(?P<alias>{_ID})$'
)

BARE_STATE_PATTERN = re.compile(rf"^state\s+(?P<id>{_ID})$")

TRANSITION_LABEL_PATTERN = re.compile(
    r"^(?P<event>[^\[\]/]+?)?(?:\s*\[(?P<guard>[^\]]*)\])?\s*"
    r"(?:/\s*(?P<action>.+))?$"
)

ORTHOGONAL_REGION_PATTERN = re.compile(r"^--+$")
HISTORY_STATE_PATTERN = re.compile(r"\[H\*?\]")
DOT_NOTATION_PATTERN = re.compile(
    rf"(?:^|\s){_ID}\.{_ID}\s*(?:-->|->)|(?:-->|->)\s*{_ID}\.{_ID}"
)

IGNORED_DIRECTIVE_PATTERN = re.compile(
    r"^(?:hide\b|show\b|skinparam\b|!theme\b|!pragma\b|!include\b|!define\b|"
    r"scale\b|title\b|caption\b|header\b|footer\b|mainframe\b|legend\b|"
    r"end\s+legend\b|note\b|end\s+note\b|"
    r"left\s+to\s+right\s+direction\b|top\s+to\s+bottom\s+direction\b)",
    re.IGNORECASE,
)


class PumlParseError(ValueError):
    """Raised when the input is not valid PlantUML in the supported subset."""

    def __init__(self, line: int, message: str) -> None:
        super().__init__(f"line {line}: {message}")
        self.line = line
        self.message = message


def parse_puml(source: str) -> StateMachineModel:
    state_map: dict[str, State] = {}
    transitions: list[Transition] = []
    aliases: dict[str, str] = {}

    lines = source.split("\n")
    inside_block = False
    current_parent: str | None = None
    brace_depth = 0

    for i, original in enumerate(lines):
        line_num = i + 1
        stripped = original.strip()

        if not stripped or stripped.startswith("'") or stripped.startswith("#"):
            continue

        raw = _strip_inline_comment(stripped)

        if raw.startswith("@startuml"):
            inside_block = True
            continue
        if raw.startswith("@enduml"):
            inside_block = False
            continue
        if not inside_block:
            continue

        if IGNORED_DIRECTIVE_PATTERN.match(raw):
            continue

        # ADR-009 hard rejections
        if current_parent is not None and ORTHOGONAL_REGION_PATTERN.match(raw):
            raise PumlParseError(line_num, "orthogonal region (--) not supported")
        if HISTORY_STATE_PATTERN.search(raw):
            raise PumlParseError(
                line_num, "history pseudo-state ([H] / [H*]) not supported"
            )
        if DOT_NOTATION_PATTERN.search(raw):
            raise PumlParseError(
                line_num, "dot-notation entry (X.Y) not supported"
            )

        if raw == "}":
            if brace_depth == 0:
                raise PumlParseError(line_num, "unmatched closing brace")
            brace_depth -= 1
            current_parent = None
            continue

        m = COMPOSITE_OPEN_PATTERN.match(raw)
        if m:
            if brace_depth >= 1:
                raise PumlParseError(
                    line_num,
                    "nested composite state not supported "
                    "(one level only per ADR-009)",
                )
            label = m.group("label")
            alias = m.group("alias")
            state_map[alias] = State(
                id=alias,
                label=label or alias,
                type="composite",
                parent_id=None,
            )
            if label:
                aliases[alias] = label
            current_parent = alias
            brace_depth = 1
            continue

        m = STATE_ALIAS_PATTERN.match(raw)
        if m:
            label = m.group("label")
            alias = m.group("alias")
            aliases[alias] = label
            _ensure_state(state_map, alias, current_parent, label=label)
            continue

        m = BARE_STATE_PATTERN.match(raw)
        if m:
            _ensure_state(state_map, m.group("id"), current_parent)
            continue

        m = TRANSITION_PATTERN.match(raw)
        if m:
            raw_src = m.group("src")
            raw_tgt = m.group("tgt")
            label_part = m.group("label")

            # An initial transition ([*] --> X) fires on entry to its region:
            # it may carry an action, but never an event or a guard (UML).
            initial_action: str | None = None
            if raw_src == INITIAL_STATE_ID:
                if raw_tgt == INITIAL_STATE_ID:
                    raise PumlParseError(
                        line_num,
                        "initial transition must target a state "
                        "([*] --> [*] is not allowed)",
                    )
                if label_part:
                    am = INITIAL_LABEL_PATTERN.match(label_part.strip())
                    if not am:
                        raise PumlParseError(line_num, INITIAL_LABEL_ERROR)
                    initial_action = am.group("action").strip()

            src = _translate_pseudo(raw_src, "source", current_parent)
            tgt = _translate_pseudo(raw_tgt, "target", current_parent)
            _ensure_state(
                state_map,
                src,
                _parent_for_pseudo(raw_src, current_parent),
                forced_type=_pseudo_type(raw_src, "source", current_parent),
            )
            _ensure_state(
                state_map,
                tgt,
                _parent_for_pseudo(raw_tgt, current_parent),
                forced_type=_pseudo_type(raw_tgt, "target", current_parent),
            )

            event: str | None = None
            guard: str | None = None
            action: str | None = None
            if raw_src == INITIAL_STATE_ID:
                action = initial_action
            elif label_part:
                event, guard, action = _parse_label(label_part.strip())

            transitions.append(
                Transition(
                    source_state_id=src,
                    target_state_id=tgt,
                    event=event,
                    guard=guard,
                    action=action,
                )
            )
            continue

        raise PumlParseError(line_num, f"unrecognized syntax: {raw}")

    if brace_depth > 0:
        raise PumlParseError(len(lines), "unclosed composite state (missing })")

    # Apply aliases as labels (TS parity)
    for alias, label in aliases.items():
        s = state_map.get(alias)
        if s and s.label != label:
            state_map[alias] = State(
                id=s.id, label=label, type=s.type, parent_id=s.parent_id
            )

    events_seen: list[str] = []
    events_set: set[str] = set()
    for t in transitions:
        if t.event and t.event not in events_set:
            events_set.add(t.event)
            events_seen.append(t.event)

    model = StateMachineModel(
        states=list(state_map.values()),
        transitions=list(transitions),
        events=events_seen,
    )
    _classify_top_level_pseudo_state(model)
    return model


def _translate_pseudo(
    raw_id: str, role: str, parent_id: str | None
) -> str:
    if raw_id != INITIAL_STATE_ID:
        return raw_id
    if parent_id is None:
        return raw_id
    return (
        f"__start_of_{parent_id}__"
        if role == "source"
        else f"__end_of_{parent_id}__"
    )


def _pseudo_type(
    raw_id: str, role: str, parent_id: str | None
):
    if raw_id != INITIAL_STATE_ID:
        return None
    if parent_id is None:
        # top-level [*] — seed as 'initial'; classifier may reclassify.
        return "initial"
    return "initial" if role == "source" else "final"


def _parent_for_pseudo(
    raw_id: str, current_parent: str | None
) -> str | None:
    # [*] outside a composite has no parent; inside, it belongs to that composite.
    return current_parent


def _ensure_state(
    state_map: dict[str, State],
    sid: str,
    parent_id: str | None,
    label: str | None = None,
    forced_type: str | None = None,
) -> None:
    if sid in state_map:
        return
    if forced_type:
        st_type = forced_type
    elif sid == INITIAL_STATE_ID:
        st_type = "initial"
    elif sid.startswith("__start_of_"):
        st_type = "initial"
    elif sid.startswith("__end_of_"):
        st_type = "final"
    else:
        st_type = "normal"
    state_map[sid] = State(
        id=sid,
        label=label if label is not None else sid,
        type=st_type,  # type: ignore[arg-type]
        parent_id=parent_id,
    )


def _classify_top_level_pseudo_state(model: StateMachineModel) -> None:
    """If top-level ``[*]`` is both source and target, split into init/final."""
    as_source = any(t.source_state_id == INITIAL_STATE_ID for t in model.transitions)
    as_target = any(t.target_state_id == INITIAL_STATE_ID for t in model.transitions)

    if as_source and as_target:
        # Relabel target-side occurrences onto a dedicated final pseudo-state.
        final_id = "[*]_final"
        model.states.append(
            State(id=final_id, label="[*]", type="final", parent_id=None)
        )
        model.transitions = [
            Transition(
                source_state_id=t.source_state_id,
                target_state_id=(
                    final_id
                    if t.target_state_id == INITIAL_STATE_ID
                    else t.target_state_id
                ),
                event=t.event,
                guard=t.guard,
                action=t.action,
            )
            for t in model.transitions
        ]
        # The original [*] row remains, already typed 'initial'.
    elif as_target and not as_source:
        # Only appears as target → reclassify as final.
        model.states = [
            State(id=s.id, label=s.label, type="final", parent_id=s.parent_id)
            if s.id == INITIAL_STATE_ID
            else s
            for s in model.states
        ]


def _parse_label(label: str) -> tuple[str | None, str | None, str | None]:
    m = TRANSITION_LABEL_PATTERN.match(label)
    if not m:
        return label, None, None
    event = (m.group("event") or "").strip() or None
    guard = (m.group("guard") or "").strip() or None
    action = (m.group("action") or "").strip() or None
    return event, guard, action


def _strip_inline_comment(line: str) -> str:
    in_quote = False
    for i, ch in enumerate(line):
        if ch == '"':
            in_quote = not in_quote
        elif ch == "'" and not in_quote:
            return line[:i].rstrip()
    return line
