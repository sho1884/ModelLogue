// PlantUML state diagram subset parser with one-level composite states (ADR-009)
//
// Supported syntax:
//   @startuml / @enduml
//   [*] --> StateName                       (initial transition)
//   StateName --> [*]                       (final transition)
//   StateName --> StateName : event [guard] / action
//   state "Display Name" as alias           (state with display label)
//   state X { ... }                         (composite state, one level only)
//   state "Display Name" as X { ... }       (composite state with display label)
//
// Inside a composite state, [*] as source represents the internal initial
// pseudo-state of THAT composite; [*] as target represents its internal final
// pseudo-state. Each composite gets its own synthetic pseudo-state ids.
//
// Rejected constructs (ADR-009):
//   - Nested composite states (composite inside composite)
//   - Orthogonal regions (-- line inside a composite)
//   - History pseudo-states ([H], [H*])
//   - Dot-notation entry to a child (CompositeName.Child)
//   - Entry/exit point pseudo-states

import type { State, Transition, StateMachineModel } from '../types/stateMachine';
import type { ParseError, ParseResult } from '../types/parser';

const INITIAL_STATE_ID = '[*]';

// Core patterns
const TRANSITION_PATTERN =
  /^(\[?\*?\]?[\w\u3040-\u9FFF]+|\[\*\])\s*(?:-->|->)\s*(\[?\*?\]?[\w\u3040-\u9FFF]+|\[\*\])(?:\s*:\s*(.+))?$/;

// Composite state opening: `state X {` or `state "Label" as X {`
const COMPOSITE_OPEN_PATTERN =
  /^state\s+(?:"([^"]+)"\s+as\s+)?([\w\u3040-\u9FFF]+)\s*\{$/;

// Regular state alias: `state "Label" as alias`
const STATE_ALIAS_PATTERN =
  /^state\s+"([^"]+)"\s+as\s+([\w\u3040-\u9FFF]+)$/;

// Bare state declaration: `state X`
const BARE_STATE_PATTERN = /^state\s+([\w\u3040-\u9FFF]+)$/;

const TRANSITION_LABEL_PATTERN =
  /^([^[\]/]+?)(?:\s*\[([^\]]*)\])?\s*(?:\/\s*(.+))?$/;

// Rejected constructs (ADR-009)
const ORTHOGONAL_REGION_PATTERN = /^--+$/; // a line of only dashes
const HISTORY_STATE_PATTERN = /\[H\*?\]/;
const DOT_NOTATION_PATTERN =
  /(?:^|\s)[\w\u3040-\u9FFF]+\.[\w\u3040-\u9FFF]+\s*(?:-->|->)|(?:-->|->)\s*[\w\u3040-\u9FFF]+\.[\w\u3040-\u9FFF]+/;

export function parseStateMachine(source: string): ParseResult {
  const errors: ParseError[] = [];
  const stateMap = new Map<string, State>();
  const transitions: Transition[] = [];
  const aliases = new Map<string, string>(); // alias -> label

  const lines = source.split('\n');
  let insideBlock = false;
  let currentParentId: string | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i].trim();

    // Skip empty lines and comments
    if (raw === '' || raw.startsWith("'") || raw.startsWith('#')) {
      continue;
    }

    // @startuml / @enduml
    if (raw.startsWith('@startuml')) {
      insideBlock = true;
      continue;
    }
    if (raw.startsWith('@enduml')) {
      insideBlock = false;
      continue;
    }

    if (!insideBlock) continue;

    // Rejected constructs (ADR-009)
    if (currentParentId !== null && ORTHOGONAL_REGION_PATTERN.test(raw)) {
      errors.push({
        line: lineNum,
        message: 'Orthogonal region (--) not supported',
      });
      continue;
    }
    if (HISTORY_STATE_PATTERN.test(raw)) {
      errors.push({
        line: lineNum,
        message: 'History pseudo-state ([H] / [H*]) not supported',
      });
      continue;
    }
    if (DOT_NOTATION_PATTERN.test(raw)) {
      errors.push({
        line: lineNum,
        message: 'Dot-notation entry (X.Y) not supported',
      });
      continue;
    }

    // Closing brace: end of composite scope
    if (raw === '}') {
      if (braceDepth === 0) {
        errors.push({ line: lineNum, message: 'Unmatched closing brace' });
        continue;
      }
      braceDepth -= 1;
      currentParentId = null;
      continue;
    }

    // Composite state opening: `state X {` or `state "Label" as X {`
    const compositeMatch = raw.match(COMPOSITE_OPEN_PATTERN);
    if (compositeMatch) {
      const [, label, alias] = compositeMatch;
      if (braceDepth >= 1) {
        errors.push({
          line: lineNum,
          message:
            'Nested composite state not supported (one level only per ADR-009)',
        });
        continue;
      }
      // Create the composite state itself (top-level only)
      stateMap.set(alias, {
        id: alias,
        label: label ?? alias,
        type: 'composite',
        parentId: null,
      });
      if (label) aliases.set(alias, label);
      currentParentId = alias;
      braceDepth = 1;
      continue;
    }

    // State alias (without opening a composite): `state "Label" as alias`
    const aliasMatch = raw.match(STATE_ALIAS_PATTERN);
    if (aliasMatch) {
      const [, label, alias] = aliasMatch;
      aliases.set(alias, label);
      ensureState(stateMap, alias, currentParentId, label);
      continue;
    }

    // Bare state declaration: `state X`
    const bareMatch = raw.match(BARE_STATE_PATTERN);
    if (bareMatch) {
      const [, name] = bareMatch;
      ensureState(stateMap, name, currentParentId);
      continue;
    }

    // Transition: A --> B : event [guard] / action
    const transMatch = raw.match(TRANSITION_PATTERN);
    if (transMatch) {
      const [, rawSrc, rawTgt, labelPart] = transMatch;
      const src = translatePseudoState(rawSrc, 'source', currentParentId);
      const tgt = translatePseudoState(rawTgt, 'target', currentParentId);

      ensureState(
        stateMap,
        src,
        parentForPseudo(rawSrc, currentParentId),
        undefined,
        pseudoTypeFor(rawSrc, 'source', currentParentId)
      );
      ensureState(
        stateMap,
        tgt,
        parentForPseudo(rawTgt, currentParentId),
        undefined,
        pseudoTypeFor(rawTgt, 'target', currentParentId)
      );

      let event: string | null = null;
      let guard: string | null = null;
      let action: string | null = null;

      if (labelPart) {
        const parsed = parseTransitionLabel(labelPart.trim());
        event = parsed.event;
        guard = parsed.guard;
        action = parsed.action;
      }

      transitions.push({
        sourceStateId: src,
        targetStateId: tgt,
        event,
        guard,
        action,
      });
      continue;
    }

    // Unrecognized
    errors.push({
      line: lineNum,
      message: `Unrecognized syntax: ${raw}`,
    });
  }

  // Report unclosed composite
  if (braceDepth > 0) {
    errors.push({
      line: lines.length,
      message: 'Unclosed composite state (missing })',
    });
  }

  // Apply aliases as labels (for non-composite states)
  for (const [alias, label] of aliases) {
    const state = stateMap.get(alias);
    if (state) {
      state.label = label;
    }
  }

  const events = [
    ...new Set(
      transitions
        .map((t) => t.event)
        .filter((e): e is string => e !== null)
    ),
  ];

  const model: StateMachineModel = {
    states: [...stateMap.values()],
    transitions,
    events,
  };

  return { model, errors };
}

/**
 * When [*] appears inside a composite, translate it to a synthetic
 * composite-specific pseudo-state id. Top-level [*] stays unchanged.
 */
function translatePseudoState(
  id: string,
  role: 'source' | 'target',
  parentId: string | null
): string {
  if (id !== INITIAL_STATE_ID) return id;
  if (parentId === null) return id;
  return role === 'source'
    ? `__start_of_${parentId}__`
    : `__end_of_${parentId}__`;
}

function pseudoTypeFor(
  id: string,
  role: 'source' | 'target',
  parentId: string | null
): 'initial' | 'final' | undefined {
  if (id !== INITIAL_STATE_ID) return undefined;
  if (parentId === null) {
    // At top level, [*] is ambiguous until classifyPseudoStates runs.
    // Seed it as 'initial' here; classifier will split if needed.
    return 'initial';
  }
  return role === 'source' ? 'initial' : 'final';
}

function parentForPseudo(
  id: string,
  currentParentId: string | null
): string | null {
  if (id !== INITIAL_STATE_ID) return currentParentId;
  // [*] at top level has no parent; inside a composite it belongs to the composite
  return currentParentId;
}

function ensureState(
  stateMap: Map<string, State>,
  id: string,
  parentId: string | null,
  label?: string,
  forcedType?: 'initial' | 'final'
): void {
  if (stateMap.has(id)) return;

  let type: State['type'];
  if (forcedType) {
    type = forcedType;
  } else if (id === INITIAL_STATE_ID) {
    type = 'initial';
  } else if (id.startsWith('__start_of_')) {
    type = 'initial';
  } else if (id.startsWith('__end_of_')) {
    type = 'final';
  } else {
    type = 'normal';
  }

  stateMap.set(id, {
    id,
    label: label ?? id,
    type,
    parentId,
  });
}

/**
 * Classify the top-level [*] pseudo-state: when it appears as both a source
 * and a target, split it into a separate `[*]_final` entry.
 *
 * Composite-internal pseudo-states are already uniquely named
 * (`__start_of_X__`, `__end_of_X__`) during parsing, so this function only
 * needs to handle the top-level [*].
 */
export function classifyPseudoStates(model: StateMachineModel): void {
  const asSource = model.transitions.some(
    (t) => t.sourceStateId === INITIAL_STATE_ID
  );
  const asTarget = model.transitions.some(
    (t) => t.targetStateId === INITIAL_STATE_ID
  );

  if (asSource && asTarget) {
    const initialState = model.states.find((s) => s.id === INITIAL_STATE_ID);
    if (initialState) {
      initialState.type = 'initial';
      const finalId = '[*]_final';
      model.states.push({
        id: finalId,
        label: '[*]',
        type: 'final',
        parentId: null,
      });
      for (const t of model.transitions) {
        if (t.targetStateId === INITIAL_STATE_ID) {
          t.targetStateId = finalId;
        }
      }
    }
  } else if (asTarget && !asSource) {
    const state = model.states.find((s) => s.id === INITIAL_STATE_ID);
    if (state) state.type = 'final';
  }
}

function parseTransitionLabel(label: string): {
  event: string | null;
  guard: string | null;
  action: string | null;
} {
  const match = label.match(TRANSITION_LABEL_PATTERN);
  if (!match) {
    return { event: label, guard: null, action: null };
  }

  const [, eventPart, guardPart, actionPart] = match;
  return {
    event: eventPart.trim() || null,
    guard: guardPart?.trim() || null,
    action: actionPart?.trim() || null,
  };
}

// Convenience: parse and classify in one call
export function parse(source: string): ParseResult {
  const result = parseStateMachine(source);
  if (result.model) {
    classifyPseudoStates(result.model);
  }
  return result;
}
