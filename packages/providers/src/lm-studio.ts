/**
 * LM Studio provider adapter.
 *
 * LM Studio exposes an OpenAI-compatible API at http://localhost:1234/v1 by default.
 * This adapter extends OpenAICompatProvider with:
 *   - A curated static capability map for popular local models
 *   - Automatic model discovery from the running LM Studio instance
 *   - Conservative defaults tuned for local model latency/reliability
 */

import type { ModelCapabilities } from '@kingdomos/core';
import { OpenAICompatProvider, type OpenAICompatConfig } from './openai-compat.js';

const LMSTUDIO_DEFAULTS: Omit<OpenAICompatConfig, 'staticCapabilities'> = {
  baseUrl: 'http://localhost:1234/v1',
  apiKey: 'lm-studio', // LM Studio ignores this but the header must be present
  providerId: 'lm-studio',
  displayName: 'LM Studio (local)',
  timeoutMs: 120_000, // local models can be slow
};

/**
 * Well-known local model capability profiles.
 * Key format: model identifier as returned by LM Studio's /models endpoint.
 * Override or extend by passing staticCapabilities in config.
 */
const KNOWN_MODELS: Record<string, ModelCapabilities> = {
  // Mistral family
  'mistral-7b-instruct': {
    contextWindow: 32768,
    toolCalling: true,
    structuredOutput: true,
    multimodal: false,
    streaming: true,
    latencyP50Ms: 400,
    costPer1MInputUsd: 0,
    costPer1MOutputUsd: 0,
    reasoningDepth: 3,
    longContextRetrieval: false,
    reliability: 0.92,
  },
  // Llama 3 family
  'meta-llama-3-8b-instruct': {
    contextWindow: 8192,
    toolCalling: true,
    structuredOutput: true,
    multimodal: false,
    streaming: true,
    latencyP50Ms: 350,
    costPer1MInputUsd: 0,
    costPer1MOutputUsd: 0,
    reasoningDepth: 3,
    longContextRetrieval: false,
    reliability: 0.93,
  },
  'meta-llama-3-70b-instruct': {
    contextWindow: 8192,
    toolCalling: true,
    structuredOutput: true,
    multimodal: false,
    streaming: true,
    latencyP50Ms: 1800,
    costPer1MInputUsd: 0,
    costPer1MOutputUsd: 0,
    reasoningDepth: 4,
    longContextRetrieval: false,
    reliability: 0.94,
  },
  // Phi-3 family
  'phi-3-mini-4k-instruct': {
    contextWindow: 4096,
    toolCalling: false,
    structuredOutput: false,
    multimodal: false,
    streaming: true,
    latencyP50Ms: 200,
    costPer1MInputUsd: 0,
    costPer1MOutputUsd: 0,
    reasoningDepth: 2,
    longContextRetrieval: false,
    reliability: 0.88,
  },
  // Qwen family (often has long context)
  'qwen2-7b-instruct': {
    contextWindow: 131072,
    toolCalling: true,
    structuredOutput: true,
    multimodal: false,
    streaming: true,
    latencyP50Ms: 450,
    costPer1MInputUsd: 0,
    costPer1MOutputUsd: 0,
    reasoningDepth: 3,
    longContextRetrieval: true,
    reliability: 0.91,
  },
};

export class LMStudioProvider extends OpenAICompatProvider {
  constructor(overrides: Partial<OpenAICompatConfig> = {}) {
    super({
      ...LMSTUDIO_DEFAULTS,
      ...overrides,
      staticCapabilities: {
        ...KNOWN_MODELS,
        ...overrides.staticCapabilities,
      },
    });
  }

  /**
   * Check if LM Studio is reachable.
   * Returns true if the /models endpoint responds within the timeout.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const models = await this.listModels();
      return models.length >= 0;
    } catch {
      return false;
    }
  }
}
