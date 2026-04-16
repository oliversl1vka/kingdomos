/**
 * Agent types — the shared contracts for agent identity, state, tasks, and lifecycle.
 *
 * These are deliberately decoupled from specific model providers so that agents
 * can be moved to a different model without changing their identity or history.
 */

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

export type AgentRole =
  | 'monarch'    // top-level orchestrator
  | 'herald'     // task decomposer
  | 'knight'     // code executor
  | 'scribe'     // document / note-taking
  | 'sentinel'   // health monitor
  | 'alchemist'  // tool/API caller
  | 'sage';      // long-context reasoning

export interface AgentProfile {
  id: string;
  role: AgentRole;
  displayName: string;
  /** Model identifier this agent is currently bound to. */
  modelId: string;
  /** Minimum capabilities required for this agent's role. */
  capabilityRequirements: import('./capabilities.js').TaskRequirements;
  createdAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Task / objective
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'pending'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface Task {
  id: string;
  parentId?: string;
  title: string;
  description: string;
  assignedAgentId?: string;
  status: TaskStatus;
  /** Structured acceptance criteria — used by the sentinel for validation. */
  acceptanceCriteria: string[];
  /** Normalised decision/output from the agent — never raw model text. */
  output?: AgentOutput;
  checkpoints: Checkpoint[];
  createdAt: string;
  updatedAt: string;
}

export interface Checkpoint {
  id: string;
  taskId: string;
  /** Serialisable snapshot of intermediate state. */
  state: Record<string, unknown>;
  createdAt: string;
}

/** Normalised agent output — model text is always parsed into this structure. */
export interface AgentOutput {
  summary: string;
  artifacts?: Artifact[];
  toolResults?: ToolResult[];
  /** Any unstructured extras the agent included. */
  metadata?: Record<string, unknown>;
}

export interface Artifact {
  kind: 'code' | 'document' | 'data' | 'image';
  language?: string;
  filename?: string;
  content: string;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: unknown;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Agent lifecycle events (append-only audit trail)
// ---------------------------------------------------------------------------

export type AgentEventKind =
  | 'created'
  | 'task_assigned'
  | 'task_started'
  | 'checkpoint_saved'
  | 'tool_called'
  | 'tool_result_received'
  | 'output_produced'
  | 'task_succeeded'
  | 'task_failed'
  | 'task_cancelled'
  | 'model_swapped'
  | 'health_check';

export interface AgentEvent {
  id: string;
  agentId: string;
  taskId?: string;
  kind: AgentEventKind;
  payload: Record<string, unknown>;
  modelId: string;
  timestamp: string;
}
