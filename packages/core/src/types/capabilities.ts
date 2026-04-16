/**
 * ModelCapabilities — describes what a model can do.
 * This is the central contract that decouples orchestration from specific models.
 * When a new model ships, you add a capabilities entry and the scheduler picks it up
 * automatically based on task requirements.
 */
export interface ModelCapabilities {
  /** Maximum input + output tokens the model handles. */
  contextWindow: number;
  /** Supports structured function/tool calls. */
  toolCalling: boolean;
  /** Can reliably return structured JSON output (schema-constrained). */
  structuredOutput: boolean;
  /** Can process image/audio inputs. */
  multimodal: boolean;
  /** Supports token-level streaming. */
  streaming: boolean;
  /** Approximate median latency to first token in milliseconds. */
  latencyP50Ms: number;
  /** Approximate cost per 1 M input tokens in USD. */
  costPer1MInputUsd: number;
  /** Approximate cost per 1 M output tokens in USD. */
  costPer1MOutputUsd: number;
  /**
   * Self-assessed reasoning depth on a 1–5 scale.
   *   1 = completion/instruct only
   *   3 = good chain-of-thought
   *   5 = extended planning / multi-step reasoning
   */
  reasoningDepth: 1 | 2 | 3 | 4 | 5;
  /** Whether the model natively supports long-context retrieval (RAG in-context). */
  longContextRetrieval: boolean;
  /**
   * Provider-reported or measured reliability score 0–1.
   * Used for SLA matching and fallback ordering.
   */
  reliability: number;
  /**
   * Optional feature flags for capabilities that don't fit neatly into the above.
   * Keep this as an escape hatch — prefer adding first-class fields for stable capabilities.
   */
  featureFlags?: Record<string, boolean>;
}

/**
 * TaskRequirements — the minimum capabilities a task needs.
 * The policy engine matches tasks to models based on this.
 */
export interface TaskRequirements {
  minContextWindow?: number;
  requiresToolCalling?: boolean;
  requiresStructuredOutput?: boolean;
  requiresMultimodal?: boolean;
  requiresStreaming?: boolean;
  maxLatencyP50Ms?: number;
  maxCostPer1MInputUsd?: number;
  minReasoningDepth?: 1 | 2 | 3 | 4 | 5;
  requiresLongContextRetrieval?: boolean;
  minReliability?: number;
  requiredFeatureFlags?: string[];
}

/**
 * Returns true if the given capabilities satisfy the task requirements.
 */
export function satisfiesRequirements(
  caps: ModelCapabilities,
  req: TaskRequirements
): boolean {
  if (req.minContextWindow !== undefined && caps.contextWindow < req.minContextWindow) return false;
  if (req.requiresToolCalling && !caps.toolCalling) return false;
  if (req.requiresStructuredOutput && !caps.structuredOutput) return false;
  if (req.requiresMultimodal && !caps.multimodal) return false;
  if (req.requiresStreaming && !caps.streaming) return false;
  if (req.maxLatencyP50Ms !== undefined && caps.latencyP50Ms > req.maxLatencyP50Ms) return false;
  if (req.maxCostPer1MInputUsd !== undefined && caps.costPer1MInputUsd > req.maxCostPer1MInputUsd) return false;
  if (req.minReasoningDepth !== undefined && caps.reasoningDepth < req.minReasoningDepth) return false;
  if (req.requiresLongContextRetrieval && !caps.longContextRetrieval) return false;
  if (req.minReliability !== undefined && caps.reliability < req.minReliability) return false;
  if (req.requiredFeatureFlags) {
    for (const flag of req.requiredFeatureFlags) {
      if (!caps.featureFlags?.[flag]) return false;
    }
  }
  return true;
}
