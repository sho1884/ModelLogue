// Process diagram parser (SR-124, v7.6).
//
// Accepts the PlantUML activity-diagram subset defined in
// `src/grammars/processDiagram.ebnf` v1.1 and produces a ProcessModel
// tree. Rejects constructs that fall outside the subset with a
// line-numbered error.
//
// Strategy: line-based, one pass. A context stack tracks the current
// container (root / if-then / if-else / fork-branch / partition).
// Emitted nodes are appended to the top-of-stack body list. Opening
// keywords (`if`, `fork`, `partition {`) push a new context; closing
// keywords (`endif`, `end fork`, `}`) pop it.
//
// Post-parse pass: scan for note blocks attached to tasks and
// extract `**外部:** name` / `**External:** name` lines into each
// task's `externalReferences` (SR-125). This runs AFTER the main
// parse so note blocks can target a task regardless of whether the
// note appears before or after the task in source.
//
// Rejected patterns surface as ParseError with a human-readable
// message that says what went wrong AND (where possible) how to
// rewrite — see rejected/ corpus README for the full catalogue.

import type {
  ProcessFork,
  ProcessIf,
  ProcessModel,
  ProcessNode,
  ProcessPartition,
  ProcessTask,
} from './model';
import type { ParseError, ProcessParseResult } from './parseResult';

// ===== Helpers =====

const IGNORED_SINGLE_LINE_RE =
  /^\s*(title|skinparam|hide|caption|!include|!import|!theme)\b/i;
const IGNORED_BLOCK_OPEN_RE = /^\s*(header|footer|legend|!procedure)\b/i;
const IGNORED_BLOCK_CLOSE_RE =
  /^\s*(endheader|endfooter|end legend|!endprocedure)\s*$/i;
const NOTE_SINGLE_RE =
  /^\s*note\s+(left|right|top|bottom)(?:\s+of\s+\S+)?\s*:\s*(.*)$/i;
const NOTE_MULTI_OPEN_RE =
  /^\s*note\s+(left|right|top|bottom)(?:\s+of\s+\S+)?\s*$/i;
const NOTE_MULTI_CLOSE_RE = /^\s*end\s+note\s*$/i;
const COMMENT_RE = /^\s*'/;
const LANE_RE = /^\s*\|([^|]*)\|\s*$/;
const ARROW_LABEL_RE = /^\s*->\s*([^;]*);\s*$/;
const START_RE = /^\s*start\s*$/;
const STOP_RE = /^\s*(stop|end)\s*$/;
const IF_OPEN_RE =
  /^\s*if\s*\(([^)]*)\)\s*then\s*\(([^)]*)\)\s*$/;
const ELSE_RE = /^\s*else\s*\(([^)]*)\)\s*$/;
const ENDIF_RE = /^\s*endif\s*$/;
const FORK_RE = /^\s*fork\s*$/;
const FORK_AGAIN_RE = /^\s*fork\s+again\s*$/;
const END_FORK_RE = /^\s*end\s+fork\s*$/;
const PARTITION_OPEN_RE =
  /^\s*partition(?:\s+(#[A-Za-z0-9_-]+))?\s+"([^"]*)"\s*\{\s*$/;
const PARTITION_CLOSE_RE = /^\s*\}\s*$/;
const TASK_RE = /^\s*:([\s\S]*?);(?:\s*<<([^>]+)>>)?\s*$/;
const STARTUML_RE = /^\s*@startuml\b/;
const ENDUML_RE = /^\s*@enduml\s*$/;

// Rejected-pattern detectors (ADR-009-style guardrails).
const REJECT_WHILE_RE = /^\s*(while|endwhile|repeat|repeat\s+while)\b/i;
const REJECT_DETACH_KILL_RE = /^\s*(detach|kill)\s*$/i;
const REJECT_ELSEIF_RE = /^\s*(elseif|else\s+if)\b/i;
const REJECT_LEGACY_START_RE = /^\s*\(\*\)\s*-->/;
const REJECT_LEGACY_ARROW_RE = /^\s*-->/;

const EXTERNAL_REF_LINE_RE =
  /^\s*\*\*\s*(?:外部|External)\s*:\s*\*\*\s*(.+?)\s*$/;

interface ParseContext {
  kind: 'root' | 'if-then' | 'if-else' | 'fork-branch' | 'partition';
  body: ProcessNode[];
  /** Line where the enclosing construct opened (for error messages). */
  openLine: number;
  /** For if/fork, pointer back to the container node being assembled. */
  containerNode?: ProcessIf | ProcessFork | ProcessPartition;
  /** Fork-branch only: index into the parent fork.branches. */
  branchIndex?: number;
}

// Attaches a just-completed task to note-external extraction later.
// We collect (lineNumber → task) pairs during the main parse so the
// second pass can match note blocks back to their preceding task by
// the nearest-earlier-task rule.
interface TaskWithLine {
  task: ProcessTask;
  line: number;
}

// ===== Main parse =====

export function parse(source: string): ProcessParseResult {
  const rawLines = source.split(/\r?\n/);
  const errors: ParseError[] = [];
  const rootBody: ProcessNode[] = [];
  const contextStack: ParseContext[] = [
    { kind: 'root', body: rootBody, openLine: 0 },
  ];

  const lanes: string[] = [];
  let currentLane = '(default)';
  const ensureLane = (name: string) => {
    if (!lanes.includes(name)) lanes.push(name);
  };

  let seenStart = false;
  let pendingIncomingLabel: string | null = null;
  let nodeIdCounter = 0;
  const nextId = () => `p${++nodeIdCounter}`;

  // For note-external extraction: remember tasks by source line.
  const tasksByLine = new Map<number, ProcessTask>();
  // Running "last task" so note blocks appearing AFTER the task can
  // attribute to it.
  let lastTaskLine: number | null = null;

  // Line-reading helpers.
  let i = 0;
  const addError = (line: number, message: string) =>
    errors.push({ line, message });

  const top = () => contextStack[contextStack.length - 1];

  const emit = (node: ProcessNode) => {
    if (pendingIncomingLabel !== null) {
      node.incomingLabel = pendingIncomingLabel;
      pendingIncomingLabel = null;
    }
    top().body.push(node);
  };

  // ===== Main line loop =====
  while (i < rawLines.length) {
    const rawLine = rawLines[i];
    const lineNum = i + 1;
    const line = rawLine;

    // Empty / blank line — move on.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // @startuml / @enduml framing — tolerant; we don't enforce order.
    if (STARTUML_RE.test(line) || ENDUML_RE.test(line)) {
      i++;
      continue;
    }

    // Comments.
    if (COMMENT_RE.test(line)) {
      i++;
      continue;
    }

    // ===== Rejected patterns (check FIRST before accept patterns) =====
    if (REJECT_WHILE_RE.test(line)) {
      addError(
        lineNum,
        '`while` / `repeat` loops are not supported — rewrite as a branch with an explicit exit, or describe the iteration in a note (see examples/rejected/03, 04)'
      );
      i++;
      continue;
    }
    if (REJECT_DETACH_KILL_RE.test(line)) {
      const keyword = line.trim().toLowerCase();
      addError(
        lineNum,
        `\`${keyword}\` is not supported — terminate the branch with an explicit \`stop\` / \`end\` (use \`:task;<<error>>\` for abnormal terminations; see examples/rejected/06, 07)`
      );
      i++;
      continue;
    }
    if (REJECT_ELSEIF_RE.test(line)) {
      addError(
        lineNum,
        '`elseif` / `else if` is not supported — rewrite as nested if/else so each decision stands alone (see examples/rejected/05)'
      );
      i++;
      continue;
    }
    if (REJECT_LEGACY_START_RE.test(line) || REJECT_LEGACY_ARROW_RE.test(line)) {
      addError(
        lineNum,
        'legacy PlantUML activity syntax (`(*) -->` / `-->` rectangle arrows) is not supported — use `start` / `:task;` / `stop` (see examples/rejected/08)'
      );
      i++;
      continue;
    }

    // ===== Accept-and-ignore decorators =====
    if (IGNORED_SINGLE_LINE_RE.test(line)) {
      i++;
      continue;
    }
    if (IGNORED_BLOCK_OPEN_RE.test(line)) {
      // Consume until block close or @enduml / EOF.
      i++;
      while (i < rawLines.length) {
        if (
          IGNORED_BLOCK_CLOSE_RE.test(rawLines[i]) ||
          ENDUML_RE.test(rawLines[i])
        ) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // ===== Note blocks — collect, then attach externals post-parse =====
    const noteSingle = line.match(NOTE_SINGLE_RE);
    if (noteSingle) {
      const body = noteSingle[2];
      attachNoteBodyToLastTask(body, tasksByLine, lastTaskLine);
      i++;
      continue;
    }
    const noteOpen = line.match(NOTE_MULTI_OPEN_RE);
    if (noteOpen) {
      const collected: string[] = [];
      i++;
      while (i < rawLines.length) {
        if (NOTE_MULTI_CLOSE_RE.test(rawLines[i])) {
          i++;
          break;
        }
        collected.push(rawLines[i]);
        i++;
      }
      attachNoteBodyToLastTask(
        collected.join('\n'),
        tasksByLine,
        lastTaskLine
      );
      continue;
    }

    // ===== Lane =====
    const laneMatch = line.match(LANE_RE);
    if (laneMatch) {
      const name = laneMatch[1].trim() || '(unnamed)';
      currentLane = name;
      ensureLane(name);
      i++;
      continue;
    }

    // ===== Arrow label (pending for next node) =====
    const arrowMatch = line.match(ARROW_LABEL_RE);
    if (arrowMatch) {
      const label = arrowMatch[1].trim();
      if (pendingIncomingLabel !== null) {
        addError(
          lineNum,
          `arrow label \`-> ${label};\` follows another unconsumed arrow label — place each label immediately before its target node`
        );
      }
      pendingIncomingLabel = label;
      i++;
      continue;
    }

    // ===== start =====
    if (START_RE.test(line)) {
      if (seenStart) {
        addError(
          lineNum,
          'a process diagram has exactly one `start` — merge the entry points into a single start followed by a branch, or split into separate diagrams (see examples/rejected/09)'
        );
        i++;
        continue;
      }
      // start must be at the top level (not inside if/fork/partition)
      if (top().kind !== 'root' && top().kind !== 'partition') {
        addError(
          lineNum,
          '`start` must appear at the top level of the diagram (not inside an `if`, `fork`, or nested block — see examples/rejected/11)'
        );
        i++;
        continue;
      }
      ensureLane(currentLane);
      emit({
        kind: 'start',
        id: nextId(),
        line: lineNum,
        lane: currentLane,
      });
      seenStart = true;
      i++;
      continue;
    }

    // ===== stop / end =====
    if (STOP_RE.test(line)) {
      ensureLane(currentLane);
      emit({
        kind: 'stop',
        id: nextId(),
        line: lineNum,
        lane: currentLane,
      });
      if (pendingIncomingLabel !== null) {
        // a label just consumed by this stop — fine; but a label AFTER
        // stop has no successor and is rejected by the arrow branch
        // above. Here we only clear state.
      }
      i++;
      continue;
    }

    // ===== if / else / endif =====
    const ifMatch = line.match(IF_OPEN_RE);
    if (ifMatch) {
      const ifNode: ProcessIf = {
        kind: 'if',
        id: nextId(),
        line: lineNum,
        condition: ifMatch[1].trim(),
        thenLabel: ifMatch[2].trim(),
        elseLabel: '',
        thenBranch: [],
        elseBranch: [],
      };
      emit(ifNode);
      contextStack.push({
        kind: 'if-then',
        body: ifNode.thenBranch,
        openLine: lineNum,
        containerNode: ifNode,
      });
      i++;
      continue;
    }
    const elseMatch = line.match(ELSE_RE);
    if (elseMatch) {
      if (top().kind !== 'if-then') {
        addError(
          lineNum,
          '`else` without a matching `if` — check that the preceding `if (…) then (…)` is still open'
        );
        i++;
        continue;
      }
      const ifCtx = contextStack.pop()!;
      const ifNode = ifCtx.containerNode as ProcessIf;
      ifNode.elseLabel = elseMatch[1].trim();
      contextStack.push({
        kind: 'if-else',
        body: ifNode.elseBranch,
        openLine: lineNum,
        containerNode: ifNode,
      });
      i++;
      continue;
    }
    if (ENDIF_RE.test(line)) {
      if (top().kind !== 'if-then' && top().kind !== 'if-else') {
        addError(
          lineNum,
          '`endif` with no matching `if`'
        );
        i++;
        continue;
      }
      if (top().kind === 'if-then') {
        addError(
          lineNum,
          '`endif` without an `else` clause — every if must include `else (...)` so Scenarios rows carry a readable branch-taken value (§3.15.3)'
        );
      }
      contextStack.pop();
      i++;
      continue;
    }

    // ===== fork / fork again / end fork =====
    if (FORK_RE.test(line)) {
      // Reject nested fork.
      if (
        contextStack.some(
          (ctx) => ctx.kind === 'fork-branch'
        )
      ) {
        addError(
          lineNum,
          'nested `fork` is not supported — flatten into a single fork with more branches, or extract the inner parallelism into a sub-process (see examples/rejected/01)'
        );
        i++;
        continue;
      }
      const forkNode: ProcessFork = {
        kind: 'fork',
        id: nextId(),
        line: lineNum,
        branches: [[]],
      };
      emit(forkNode);
      contextStack.push({
        kind: 'fork-branch',
        body: forkNode.branches[0],
        openLine: lineNum,
        containerNode: forkNode,
        branchIndex: 0,
      });
      i++;
      continue;
    }
    if (FORK_AGAIN_RE.test(line)) {
      if (top().kind !== 'fork-branch') {
        addError(
          lineNum,
          '`fork again` outside of a `fork` block'
        );
        i++;
        continue;
      }
      const prevCtx = contextStack.pop()!;
      const forkNode = prevCtx.containerNode as ProcessFork;
      const newBranch: ProcessNode[] = [];
      forkNode.branches.push(newBranch);
      contextStack.push({
        kind: 'fork-branch',
        body: newBranch,
        openLine: lineNum,
        containerNode: forkNode,
        branchIndex: forkNode.branches.length - 1,
      });
      i++;
      continue;
    }
    if (END_FORK_RE.test(line)) {
      if (top().kind !== 'fork-branch') {
        addError(lineNum, '`end fork` with no matching `fork`');
        i++;
        continue;
      }
      contextStack.pop();
      i++;
      continue;
    }

    // ===== partition =====
    const partOpen = line.match(PARTITION_OPEN_RE);
    if (partOpen) {
      // Reject nested partition.
      if (contextStack.some((ctx) => ctx.kind === 'partition')) {
        addError(
          lineNum,
          'nested `partition` is not supported — keep sub-process grouping to 1 level; flatten siblings or split into separate diagrams (see examples/rejected/02)'
        );
        i++;
        continue;
      }
      const partNode: ProcessPartition = {
        kind: 'partition',
        id: nextId(),
        line: lineNum,
        name: partOpen[2],
        color: partOpen[1] ?? null,
        body: [],
      };
      emit(partNode);
      contextStack.push({
        kind: 'partition',
        body: partNode.body,
        openLine: lineNum,
        containerNode: partNode,
      });
      i++;
      continue;
    }
    if (PARTITION_CLOSE_RE.test(line)) {
      if (top().kind !== 'partition') {
        addError(lineNum, '`}` with no matching `partition { ... }`');
        i++;
        continue;
      }
      contextStack.pop();
      i++;
      continue;
    }

    // ===== task =====
    // Task labels may span multiple lines (`:foo\nbar;`). If the
    // current line has `:` but no matching `;`, keep consuming.
    if (line.trimStart().startsWith(':')) {
      let collected = line;
      while (!/;\s*(?:<<[^>]+>>)?\s*$/.test(collected) && i + 1 < rawLines.length) {
        i++;
        collected += '\n' + rawLines[i];
      }
      const taskMatch = collected.match(TASK_RE);
      if (taskMatch) {
        ensureLane(currentLane);
        const task: ProcessTask = {
          kind: 'task',
          id: nextId(),
          line: lineNum,
          label: taskMatch[1],
          stereotype: taskMatch[2] ?? null,
          lane: currentLane,
          externalReferences: [],
        };
        emit(task);
        tasksByLine.set(lineNum, task);
        lastTaskLine = lineNum;
      } else {
        addError(lineNum, `could not parse task — expected \`:label;\` form`);
      }
      i++;
      continue;
    }

    // ===== Unknown line — error =====
    addError(
      lineNum,
      `unrecognised line: \`${line.trim()}\` (see src/grammars/processDiagram.ebnf for accepted constructs)`
    );
    i++;
  }

  // ===== Post-parse validations =====
  if (!seenStart) {
    addError(
      0,
      'process diagram must contain exactly one `start` node'
    );
  }

  // Unclosed containers.
  while (contextStack.length > 1) {
    const open = contextStack.pop()!;
    const label =
      open.kind === 'if-then' || open.kind === 'if-else'
        ? '`if` without matching `endif`'
        : open.kind === 'fork-branch'
          ? '`fork` without matching `end fork`'
          : '`partition` without matching `}`';
    addError(open.openLine, label);
  }

  // Dangling arrow label at EOF.
  if (pendingIncomingLabel !== null) {
    addError(
      rawLines.length,
      `arrow label \`-> ${pendingIncomingLabel};\` has no successor node before end of diagram (see examples/rejected/10)`
    );
  }

  if (errors.length > 0) return { model: null, errors };

  return {
    model: {
      rootBody,
      lanes: lanes.length > 0 ? lanes : ['(default)'],
    },
    errors,
  };
}

// ===== Note external extraction =====

/**
 * Parse the body of a note (single-line or multi-line) and, for every
 * `**外部:** name` / `**External:** name` line, append `name` to the
 * externalReferences of the task at `lastTaskLine` (per SR-125).
 *
 * If no task has been emitted yet (note before start, or free-floating
 * note), the note content is silently dropped — notes are
 * accept-and-ignore by EBNF.
 */
function attachNoteBodyToLastTask(
  body: string,
  tasksByLine: Map<number, ProcessTask>,
  lastTaskLine: number | null
): void {
  if (lastTaskLine === null) return;
  const task = tasksByLine.get(lastTaskLine);
  if (!task) return;
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(EXTERNAL_REF_LINE_RE);
    if (m) task.externalReferences.push(m[1].trim());
  }
}
