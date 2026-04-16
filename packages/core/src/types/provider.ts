/**
 * Provider — the unified interface every model adapter must implement.
 *
 * Keeping this thin means adding a new provider never touches orchestration code.
 * Each provider maps its own protocol quirks to these standard shapes.
 */

import type { ModelCapabilities } from './capabilities.js';

// ---------------------------------------------------------------------------
// Shared message types
// ---------------------------------------------------------------------------

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export type MessageContent = string | (TextContent | ImageContent)[];

export interface Message {
  role: MessageRole;
  content: MessageContent;
  /** Present when role === 'tool'. */
  toolCallId?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Tool / function call types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the parameters. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string from the model. */
  arguments: string;
}

// ---------------------------------------------------------------------------
// Chat completion types
// ---------------------------------------------------------------------------

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  /** Force a specific tool or 'auto' / 'none'. */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** JSON Schema to constrain the response. Only used if structuredOutput is supported. */
  responseFormat?: { type: 'json_schema'; json_schema: Record<string, unknown> };
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string | null;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatStreamChunk {
  delta: string;
  toolCallDeltas?: Array<{ id?: string; name?: string; argumentsDelta?: string }>;
  finishReason?: ChatResponse['finishReason'];
}

// ---------------------------------------------------------------------------
// Embeddings types
// ---------------------------------------------------------------------------

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage: { promptTokens: number; totalTokens: number };
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface Provider {
  /** Unique identifier for this provider instance (e.g. 'lm-studio', 'openai'). */
  readonly id: string;
  /** Human-readable display name. */
  readonly displayName: string;

  /**
   * Returns the capabilities for a given model identifier.
   * If the model is unknown, returns null (caller should fall back to next provider).
   */
  getCapabilities(model: string): Promise<ModelCapabilities | null>;

  /** List models available from this provider. */
  listModels(): Promise<string[]>;

  /** Perform a chat completion. */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Stream a chat completion.
   * The returned async iterable yields chunks until the stream is done.
   */
  streamChat?(request: ChatRequest): AsyncIterable<ChatStreamChunk>;

  /** Generate embeddings. Returns null if the provider doesn't support it. */
  embed?(request: EmbeddingRequest): Promise<EmbeddingResponse | null>;
}
