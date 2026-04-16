/**
 * ModelRegistry — versioned registry of models and their capabilities.
 *
 * The registry is the single source of truth for what models are available,
 * what they can do, and whether they're enabled. Schedulers and policy engines
 * query this rather than hard-coding model names.
 *
 * Design principles:
 *  - immutable entries (add new versions, don't mutate existing)
 *  - feature flags allow soft-launching capabilities without code changes
 *  - providers can register themselves at startup
 */

import type { ModelCapabilities, TaskRequirements } from '../types/capabilities.js';
import { satisfiesRequirements as satisfiesRequirementsImpl } from '../types/capabilities.js';
import type { Provider } from '../types/provider.js';

export interface ModelEntry {
  /** Globally unique model identifier. Format: 'provider/model-name@version' */
  id: string;
  /** Human-readable model name. */
  displayName: string;
  /** Provider identifier that serves this model. */
  providerId: string;
  /** Exact model string to pass to the provider API. */
  providerModelId: string;
  capabilities: ModelCapabilities;
  /**
   * Feature flags scoped to this specific model entry.
   * Overrides capabilities.featureFlags if set.
   */
  featureFlags: Record<string, boolean>;
  /**
   * Whether this entry is active. Disabled entries are kept for audit purposes
   * but are never selected by the scheduler.
   */
  enabled: boolean;
  /** ISO-8601 timestamp when this entry was added. */
  registeredAt: string;
  /** Optional deprecation notice — shown in CLI and logs. */
  deprecationNotice?: string;
}

export class ModelRegistry {
  private readonly entries = new Map<string, ModelEntry>();
  private readonly providers = new Map<string, Provider>();

  // ---------------------------------------------------------------------------
  // Provider registration
  // ---------------------------------------------------------------------------

  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  listProviders(): Provider[] {
    return [...this.providers.values()];
  }

  // ---------------------------------------------------------------------------
  // Model registration
  // ---------------------------------------------------------------------------

  register(entry: Omit<ModelEntry, 'registeredAt'>): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`Model '${entry.id}' is already registered. Use a new version identifier.`);
    }
    this.entries.set(entry.id, {
      ...entry,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Mark an existing entry as disabled. Keeps it in the registry for audit.
   */
  disable(id: string, reason?: string): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Model '${id}' not found in registry.`);
    this.entries.set(id, {
      ...entry,
      enabled: false,
      deprecationNotice: reason ?? entry.deprecationNotice,
    });
  }

  getEntry(id: string): ModelEntry | undefined {
    return this.entries.get(id);
  }

  listAll(): ModelEntry[] {
    return [...this.entries.values()];
  }

  listEnabled(): ModelEntry[] {
    return this.listAll().filter((e) => e.enabled);
  }

  // ---------------------------------------------------------------------------
  // Capability-first selection
  // ---------------------------------------------------------------------------

  /**
   * Returns all enabled models that satisfy the given capability requirements,
   * ordered by the given sort key (default: reliability descending).
   */
  findModels(
    requirements: TaskRequirements,
    sortBy: 'reliability' | 'latency' | 'cost' = 'reliability'
  ): ModelEntry[] {
    const candidates = this.listEnabled().filter((e) =>
      satisfiesRequirementsImpl(e.capabilities, requirements)
    );

    return candidates.sort((a, b) => {
      switch (sortBy) {
        case 'latency':
          return a.capabilities.latencyP50Ms - b.capabilities.latencyP50Ms;
        case 'cost':
          return a.capabilities.costPer1MInputUsd - b.capabilities.costPer1MInputUsd;
        case 'reliability':
        default:
          return b.capabilities.reliability - a.capabilities.reliability;
      }
    });
  }

  /**
   * Returns the single best model for the given requirements, or null if none match.
   */
  selectBest(
    requirements: TaskRequirements,
    sortBy: 'reliability' | 'latency' | 'cost' = 'reliability'
  ): ModelEntry | null {
    return this.findModels(requirements, sortBy)[0] ?? null;
  }
}

/** Global singleton registry — import and use this everywhere. */
export const registry = new ModelRegistry();
