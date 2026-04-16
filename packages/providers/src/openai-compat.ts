/**
 * OpenAI-compatible provider adapter.
 *
 * Works with any endpoint that speaks the OpenAI chat completions API:
 *   - OpenAI
 *   - Azure OpenAI
 *   - LM Studio (uses this base, with a thin override for capability discovery)
 *   - Ollama (with openai compat enabled)
 *   - Together.ai, Groq, Fireworks, etc.
 *
 * Capability data can be supplied at construction time (static map) or fetched
 * from the provider's /models endpoint at runtime.
 */

import type {
  Provider,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelCapabilities,
  Message,
} from '@kingdomos/core';

export interface OpenAICompatConfig {
  /** Base URL, e.g. 'http://localhost:1234/v1' or 'https://api.openai.com/v1'. */
  baseUrl: string;
  /** API key. Pass an empty string for providers that don't need one. */
  apiKey: string;
  /** Override the provider id. Defaults to the hostname. */
  providerId?: string;
  /** Display name shown in UI. */
  displayName?: string;
  /**
   * Static capability map: modelId → capabilities.
   * Used when the provider doesn't expose a /capabilities endpoint.
   * If omitted, a conservative default is used for unknown models.
   */
  staticCapabilities?: Record<string, ModelCapabilities>;
  /** Default request timeout in milliseconds. Default: 60 000. */
  timeoutMs?: number;
}

const CONSERVATIVE_DEFAULTS: ModelCapabilities = {
  contextWindow: 4096,
  toolCalling: false,
  structuredOutput: false,
  multimodal: false,
  streaming: true,
  latencyP50Ms: 2000,
  costPer1MInputUsd: 0,
  costPer1MOutputUsd: 0,
  reasoningDepth: 2,
  longContextRetrieval: false,
  reliability: 0.9,
};

export class OpenAICompatProvider implements Provider {
  readonly id: string;
  readonly displayName: string;

  constructor(private readonly config: OpenAICompatConfig) {
    try {
      this.id = config.providerId ?? new URL(config.baseUrl).hostname;
    } catch {
      this.id = config.providerId ?? 'openai-compat';
    }
    this.displayName = config.displayName ?? this.id;
  }

  async getCapabilities(model: string): Promise<ModelCapabilities | null> {
    const caps = this.config.staticCapabilities?.[model];
    if (caps) return caps;
    // Return conservative defaults rather than null so orchestration continues.
    return { ...CONSERVATIVE_DEFAULTS };
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetch('/models');
    const json = await res.json() as { data?: Array<{ id: string }> };
    return json.data?.map((m) => m.id) ?? [];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.buildChatBody(request);
    const res = await this.fetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${this.id}: chat request failed (${res.status}): ${text}`);
    }

    const json = await res.json() as {
      id: string;
      model: string;
      choices: Array<{
        message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = json.choices[0];
    return {
      id: json.id,
      model: json.model ?? request.model,
      content: choice?.message?.content ?? null,
      toolCalls: choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      finishReason: (choice?.finish_reason ?? 'stop') as ChatResponse['finishReason'],
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const body = this.buildChatBody({ ...request, stream: true });
    const res = await this.fetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(`${this.id}: stream request failed (${res.status}): ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const chunk = JSON.parse(data) as {
              choices: Array<{
                delta: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
                finish_reason?: string;
              }>;
            };
            const delta = chunk.choices[0]?.delta;
            yield {
              delta: delta?.content ?? '',
              toolCallDeltas: delta?.tool_calls?.map((tc) => ({
                id: tc.id,
                name: tc.function?.name,
                argumentsDelta: tc.function?.arguments,
              })),
              finishReason: chunk.choices[0]?.finish_reason as ChatStreamChunk['finishReason'],
            };
          } catch {
            // malformed chunk — skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse | null> {
    try {
      const res = await this.fetch('/embeddings', {
        method: 'POST',
        body: JSON.stringify({ model: request.model, input: request.input }),
      });
      if (!res.ok) return null;
      const json = await res.json() as {
        data: Array<{ embedding: number[] }>;
        usage: { prompt_tokens: number; total_tokens: number };
      };
      return {
        embeddings: json.data.map((d) => d.embedding),
        usage: {
          promptTokens: json.usage?.prompt_tokens ?? 0,
          totalTokens: json.usage?.total_tokens ?? 0,
        },
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildChatBody(request: ChatRequest): Record<string, unknown> {
    const messages = request.messages.map((m: Message) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.name ? { name: m.name } : {}),
    }));

    return {
      model: request.model,
      messages,
      ...(request.tools?.length ? { tools: request.tools.map((t: import('@kingdomos/core').ToolDefinition) => ({ type: 'function', function: t })) } : {}),
      ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
      ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.stream ? { stream: true } : {}),
    };
  }

  private fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const timeout = this.config.timeoutMs ?? 60_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    return fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    }).finally(() => clearTimeout(timer));
  }
}
