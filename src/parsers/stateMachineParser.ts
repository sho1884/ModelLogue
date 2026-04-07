// PlantUML state diagram subset parser
// Supported syntax:
//   @startuml / @enduml
//   [*] --> StateName
//   StateName --> [*]
//   StateName --> StateName : event [guard] / action
//   state "Display Name" as alias

import type { State, Transition, StateMachineModel } from '../types/stateMachine';
import type { ParseError, ParseResult } from '../types/parser';

const INITIAL_STATE_ID = '[*]';

// Regex patterns for PlantUML state diagram syntax
const TRANSITION_PATTERN =
  /^(\[?\*?\]?[\w\u3040-\u9FFF]+|\[\*\])\s*(?:-->|->)\s*(\[?\*?\]?[\w\u3040-\u9FFF]+|\[\*\])(?:\s*:\s*(.+))?$/;

const STATE_ALIAS_PATTERN =
  /^state\s+"([^"]+)"\s+as\s+([\w\u3040-\u9FFF]+)$/;

const TRANSITION_LABEL_PATTERN =
  /^([^[\]/]+?)(?:\s*\[([^\]]*)\])?\s*(?:\/\s*(.+))?$/;

export function parseStateMachine(source: string): ParseResult {
  const errors: ParseError[] = [];
  const stateMap = new Map<string, State>();
  const transitions: Transition[] = [];
  const aliases = new Map<string, string>(); // alias -> label

  const lines = source.split('\n');
  let insideBlock = false;

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

    // state "Display Name" as alias
    const aliasMatch = raw.match(STATE_ALIAS_PATTERN);
    if (aliasMatch) {
      const [, label, alias] = aliasMatch;
      aliases.set(alias, label);
      ensureState(stateMap, alias, label);
      continue;
    }

    // Transition: A --> B : event [guard] / action
    const transMatch = raw.match(TRANSITION_PATTERN);
    if (transMatch) {
      const [, src, tgt, labelPart] = transMatch;
      ensureState(stateMap, src);
      ensureState(stateMap, tgt);

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

    // Unrecognized line
    errors.push({
      line: lineNum,
      message: `Unrecognized syntax: ${raw}`,
    });
  }

  // Apply aliases as labels
  for (const [alias, label] of aliases) {
    const state = stateMap.get(alias);
    if (state) {
      state.label = label;
    }
  }

  // Build deduplicated events list
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

function ensureState(
  stateMap: Map<string, State>,
  id: string,
  label?: string
): void {
  if (stateMap.has(id)) return;

  let type: State['type'] = 'normal';
  if (id === INITIAL_STATE_ID) {
    // Determine if initial or final based on usage context
    // For [*], we create a single entry; direction is determined by transitions
    type = 'initial';
  }

  stateMap.set(id, {
    id,
    label: label ?? id,
    type,
  });
}

// Classify [*] states after all transitions are parsed
export function classifyPseudoStates(model: StateMachineModel): void {
  // [*] as source = initial, [*] as target = final
  const asSource = model.transitions.some(
    (t) => t.sourceStateId === INITIAL_STATE_ID
  );
  const asTarget = model.transitions.some(
    (t) => t.targetStateId === INITIAL_STATE_ID
  );

  // If [*] appears as both source and target, we need separate entries
  if (asSource && asTarget) {
    const initialState = model.states.find((s) => s.id === INITIAL_STATE_ID);
    if (initialState) {
      initialState.type = 'initial';
      // Add a separate final pseudo-state
      const finalId = '[*]_final';
      model.states.push({ id: finalId, label: '[*]', type: 'final' });
      // Remap transitions targeting [*] to the final pseudo-state
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
  // If only asSource, it stays as 'initial' (default)
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
