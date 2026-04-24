// Process diagram canonical model (UR-015, ADR-012, v7.6).
//
// Parsed from the PlantUML activity-diagram subset defined in
// src/grammars/processDiagram.ebnf v1.1.
//
// Shape: a tree — each node is either a leaf (start / stop / task)
// or a container (if / fork / partition). The tree root is
// `ProcessModel.rootBody`, a list of top-level nodes. This shape
// directly drives the Scenarios-tab path enumeration (SR-120): a path
// is produced by depth-first traversal, choosing one branch at each
// `if` and flattening `fork` branches as parallel sets.
//
// Lanes, stereotypes, partition colors, and external references are
// carried on the nodes (not as separate collections) so scenarios,
// events, roles, artifacts, and externals tabs can all be computed
// from a single walk of the tree.

export type ProcessNode =
  | ProcessStart
  | ProcessStop
  | ProcessTask
  | ProcessIf
  | ProcessFork
  | ProcessPartition;

/**
 * Common fields on every node. Each node has a stable id generated
 * by the parser (monotonic across a parse) so analysis tabs and
 * auto-markers can reference a node by id without needing to match
 * labels.
 */
export interface ProcessNodeBase {
  id: string;
  /** Source line number (1-based) of the first line of this node. */
  line: number;
  /**
   * Optional label on the INCOMING edge — set by the `-> label;`
   * arrow-label line that precedes this node. The 伝票 / artifact
   * name rides here (SR-123).
   */
  incomingLabel?: string;
}

/**
 * The unique diagram entry point. Exactly one `ProcessStart` per
 * parsed model, placed at the top level of rootBody (never inside
 * an if / fork / partition).
 */
export interface ProcessStart extends ProcessNodeBase {
  kind: 'start';
  /** Lane active at the moment `start` fires. */
  lane: string;
}

/**
 * A terminal exit node. `stop` and `end` are treated identically by
 * parser and downstream tabs. A model may contain many stops (one
 * per branch exit) per SR-124.
 */
export interface ProcessStop extends ProcessNodeBase {
  kind: 'stop';
  /** Lane active at the moment this stop is reached. */
  lane: string;
}

/**
 * A single work step (`:label;` in PlantUML activity). The vast
 * majority of nodes in a real diagram are tasks.
 *
 * Event semantics: tasks with stereotype 'timer' / 'message' /
 * 'error' are surfaced in the Events tab (SR-121). Any other
 * stereotype is preserved as-is but does not trigger event
 * handling.
 */
export interface ProcessTask extends ProcessNodeBase {
  kind: 'task';
  /** The label between `:` and `;`. May contain newlines. */
  label: string;
  /** Lane active when this task is executed. */
  lane: string;
  /**
   * Raw stereotype name from `:task;<<stereotype>>`, or null if none.
   * Event-recognised values: 'timer', 'message', 'error'.
   */
  stereotype: string | null;
  /**
   * External IT systems / repositories touched by this task, in
   * declaration order. Extracted from note blocks attached to the
   * task that contain `**外部:** name` or `**External:** name`
   * lines (SR-125).
   */
  externalReferences: string[];
}

/**
 * An if / else / endif branch. Each branch is its own list of nodes,
 * so path enumeration can recurse into each independently.
 *
 * ModelLogue REQUIRES both branch labels (`then (yes)` and
 * `else (no)`) so Scenarios rows can display a readable branch-taken
 * value (§3.15.3).
 */
export interface ProcessIf extends ProcessNodeBase {
  kind: 'if';
  condition: string;
  thenLabel: string;
  elseLabel: string;
  thenBranch: ProcessNode[];
  elseBranch: ProcessNode[];
}

/**
 * A fork / fork again / end fork parallel region. `branches[i]` is
 * one parallel branch, as a list of nodes. Path enumeration treats
 * the whole fork as a single step in a path — it does NOT combinate
 * the branches (that would be a combinatorial explosion on larger
 * diagrams; see SR-120 for the semantic decision).
 *
 * Nested forks are rejected at parse time.
 */
export interface ProcessFork extends ProcessNodeBase {
  kind: 'fork';
  branches: ProcessNode[][];
}

/**
 * A sub-process grouping. Rendered as a box around its contents in
 * PlantUML. Partitions may contain lane declarations, which is how
 * a "multi-actor sub-process" is expressed (the partition box will
 * span multiple lane columns visually).
 *
 * Nested partitions are rejected at parse time (ADR-009-style
 * 1-level-only guardrail).
 */
export interface ProcessPartition extends ProcessNodeBase {
  kind: 'partition';
  name: string;
  /** Optional `#Color` tag; null if not specified. */
  color: string | null;
  body: ProcessNode[];
}

export interface ProcessModel {
  /**
   * Top-level node list. The first non-lane / non-partition-frame
   * node is the unique `ProcessStart`; the last descendants are
   * `ProcessStop` nodes (one or more).
   */
  rootBody: ProcessNode[];
  /**
   * Every lane name declared via `|Actor|`, in first-seen order.
   * The literal `(default)` appears first if any node precedes the
   * first lane declaration.
   */
  lanes: string[];
}

// ===== Helpers =====

/**
 * Walk every node in the tree depth-first, invoking `visit` on each.
 * Order: nodes are visited in declaration order. Branches / fork
 * branches / partition bodies are recursed into AFTER the container
 * node itself is visited.
 */
export function walkProcessNodes(
  body: ProcessNode[],
  visit: (node: ProcessNode) => void
): void {
  for (const node of body) {
    visit(node);
    if (node.kind === 'if') {
      walkProcessNodes(node.thenBranch, visit);
      walkProcessNodes(node.elseBranch, visit);
    } else if (node.kind === 'fork') {
      for (const branch of node.branches) walkProcessNodes(branch, visit);
    } else if (node.kind === 'partition') {
      walkProcessNodes(node.body, visit);
    }
  }
}
