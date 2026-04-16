/**
 * Public surface of @kingdomos/core.
 * Import from here, never from internal paths.
 */

// Types
export type {
  ModelCapabilities,
  TaskRequirements,
} from './types/capabilities.js';
export { satisfiesRequirements } from './types/capabilities.js';

export type {
  MessageRole,
  TextContent,
  ImageContent,
  MessageContent,
  Message,
  ToolDefinition,
  ToolCall,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  Provider,
} from './types/provider.js';

export type {
  AgentRole,
  AgentProfile,
  TaskStatus,
  Task,
  Checkpoint,
  AgentOutput,
  Artifact,
  ToolResult,
  AgentEventKind,
  AgentEvent,
} from './types/agent.js';

export type {
  AnimationClipId,
  AnimationClip,
  AgentAnimationManifest,
} from './types/animation.js';
export {
  REQUIRED_CLIPS,
  validateManifest,
  resolveClip,
} from './types/animation.js';

// Registry
export type { ModelEntry } from './registry/model-registry.js';
export { ModelRegistry, registry } from './registry/model-registry.js';

// Orchestration
export type {
  SelectionStrategy,
  RoutingDecision,
  PolicyEngineOptions,
} from './orchestration/policy-engine.js';
export { PolicyEngine } from './orchestration/policy-engine.js';
