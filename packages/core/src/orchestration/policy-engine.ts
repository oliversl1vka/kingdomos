/**
 * PolicyEngine — matches tasks to the best available model based on task requirements.
 *
 * The engine is intentionally stateless: it reads from the registry and produces a
 * routing decision. This makes it easy to test and to override in specific scenarios.
 */

import type { TaskRequirements } from '../types/capabilities.js';
import type { ModelEntry } from '../registry/model-registry.js';
import type { ModelRegistry } from '../registry/model-registry.js';

export type SelectionStrategy = 'reliability' | 'latency' | 'cost';

export interface RoutingDecision {
  modelEntry: ModelEntry;
  providerId: string;
  reason: string;
}

export interface PolicyEngineOptions {
  /** Default selection strategy when none is specified per-task. */
  defaultStrategy?: SelectionStrategy;
  /**
   * When true, the engine throws if no model satisfies requirements.
   * When false (default), it returns the best available match even if incomplete.
   */
  strict?: boolean;
}

export class PolicyEngine {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly options: PolicyEngineOptions = {}
  ) {}

  /**
   * Select the best model for a given set of task requirements.
   * Throws if strict mode is on and no model qualifies.
   */
  route(
    requirements: TaskRequirements,
    strategy: SelectionStrategy = this.options.defaultStrategy ?? 'reliability'
  ): RoutingDecision {
    const best = this.registry.selectBest(requirements, strategy);

    if (!best) {
      if (this.options.strict) {
        throw new Error(
          `PolicyEngine: no enabled model satisfies requirements: ${JSON.stringify(requirements)}`
        );
      }
      // Non-strict: fall back to any enabled model ordered by reliability
      const fallback = this.registry.listEnabled().sort(
        (a, b) => b.capabilities.reliability - a.capabilities.reliability
      )[0];

      if (!fallback) {
        throw new Error('PolicyEngine: no models are registered and enabled.');
      }

      return {
        modelEntry: fallback,
        providerId: fallback.providerId,
        reason: `fallback — no model exactly matched requirements; using best available (${fallback.id})`,
      };
    }

    return {
      modelEntry: best,
      providerId: best.providerId,
      reason: `selected by ${strategy} strategy`,
    };
  }

  /**
   * Returns all models that could handle this task, sorted by strategy.
   * Useful for building UI dropdowns or eval harness comparisons.
   */
  getCandidates(
    requirements: TaskRequirements,
    strategy: SelectionStrategy = this.options.defaultStrategy ?? 'reliability'
  ): RoutingDecision[] {
    return this.registry.findModels(requirements, strategy).map((entry) => ({
      modelEntry: entry,
      providerId: entry.providerId,
      reason: `candidate via ${strategy}`,
    }));
  }
}
