export type Role = 'user' | 'assistant' | 'system' | 'tool';

/** Tool call envelope normalized across providers */
export interface ToolCall {
  id: string;                 // provider's tool_call_id (or synthesized UUID)
  name: string;               // tool name
  arguments: unknown;         // provider-parsed args (object) or raw JSON string parsed upstream
}

/** Messages are discriminated by role for precision */
export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;

export interface SystemMessage {
  role: 'system';
  content: string;
  name?: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
  name?: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;            // final text from the model
  name?: string;
  /** When the model wants to call tools, it returns one or more tool calls */
  tool_calls?: ToolCall[];
}

export interface ToolMessage {
  role: 'tool';
  /** Tool JSON/string result to be fed back to the model */
  content: string;
  /** Link back to the specific assistant tool call */
  tool_call_id: string;
  /** (optional) echo the tool name for debugging/trace */
  name?: string;
}

/** LLM call options */
export type ToolChoice =
  | 'auto'                     // model decides
  | 'none'                     // forbid tools
  | 'required'                 // force at least one tool call when supported
  | { name: string };          // force a specific tool by name (if provider supports)

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  toolChoice?: ToolChoice;
  signal?: AbortSignal;
  tools?: Tool[];              // schemas surfaced to the provider
  parallelToolCalls?: boolean; // hint for providers supporting parallelism
  stream?: boolean;            // request token streaming when supported
  // providerMeta?: Record<string, unknown>; // (optional) adapter-specific knob pass-through
}

/** Streaming events */
export type ModelEvent =
  | { type: 'token'; token: string }
  | { type: 'tool_call'; call: ToolCall }      // normalized, not per-provider delta
  | { type: 'assistant_message'; message: AssistantMessage }
  | { type: 'usage'; usage: Usage };           // optional live usage updates

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUSD?: number;
}

/** Final response */
export interface ModelResponse {
  message: AssistantMessage;  // assistant may or may not have tool_calls
  usage?: Usage;
}

/** Adapter contract */
export interface LLM {
  name: string;
  capabilities: { functionCall?: boolean; streaming?: boolean };
  generate(messages: Message[], opts?: GenerateOptions): Promise<ModelResponse>;
  generate(messages: Message[], opts?: GenerateOptions): AsyncIterable<ModelEvent>;
  generate(messages: Message[], opts?: GenerateOptions): Promise<ModelResponse | AsyncIterable<ModelEvent>>;
}

/** Logger, Memory, TokenStream: unchanged */
export interface Logger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  span?(name: string, attrs?: Record<string, unknown>): void;
}

export interface Memory {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, val: unknown): Promise<void>;
  retrieval?(
    index: string
  ): { search: (q: string, topK?: number) => Promise<Array<{ text: string; score?: number }>> };
}

export interface TokenStream {
  write(token: string): void;
  end(): void;
}

/**
 * Restricted context for tool execution.
 * Tools have access to a sandboxed subset of Ctx to prevent:
 * - Tools calling other tools (no tools registry access)
 * - Tools manipulating conversation history (no messages access)
 * - Tools accessing middleware state (no state access)
 * - Tools interfering with user I/O (no input/stream access)
 *
 * Tools CAN:
 * - Use the model for meta-operations (e.g., summarizeText)
 * - Access persistent memory
 * - Respect cancellation signals
 * - Log their operations
 * - Access injected dependencies (for testing/configuration)
 */
export interface ToolContext {
  readonly memory: Memory;
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly model: LLM;
  /** Optional dependency injection container for testing or runtime configuration */
  readonly deps?: Record<string, unknown>;
}

/** Stronger Tool typing with generics */
export interface Tool<TArgs = any, TResult = unknown> {
  name: string;
  description?: string;
  schema: any; // zod schema at runtime
  handler: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}

/** Registry */
export interface ToolRegistry {
  list(): Tool[];
  get(name: string): Tool | undefined;
  register(tool: Tool): void;
}

/** Context */
export interface Ctx {
  input?: string;
  messages: Message[];
  model: LLM;
  tools: ToolRegistry;
  memory: Memory;
  stream: TokenStream;
  state: Record<string, unknown>;
  signal: AbortSignal;
  log: Logger;
}
