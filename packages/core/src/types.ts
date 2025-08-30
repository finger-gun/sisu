export type Role = 'user'|'assistant'|'system'|'tool';

export interface Message { role: Role; content: string; name?: string; }

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  toolChoice?: 'auto'|'none'|string;
  signal?: AbortSignal;
  tools?: Tool[];
  parallelToolCalls?: boolean; // hint for providers that support it
}

export type ModelEvent =
  | { type: 'token'; token: string }
  | { type: 'tool_call'; name: string; arguments: unknown }
  | { type: 'assistant_message'; message: Message }
  ;

export interface ModelResponse {
  message: Message;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; costUSD?: number };
}

export interface LLM {
  name: string;
  capabilities: { functionCall?: boolean; streaming?: boolean };
  generate(messages: Message[], opts?: GenerateOptions): AsyncIterable<ModelEvent> | Promise<ModelResponse>;
}

export interface Logger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  span?(name: string, attrs?: Record<string, unknown>): void;
}

export interface Memory {
  get<T=unknown>(key: string): Promise<T|undefined>;
  set(key: string, val: unknown): Promise<void>;
  retrieval?(index: string): { search: (q: string, topK?: number) => Promise<Array<{text: string, score?: number}>> };
}

export interface TokenStream {
  write(token: string): void;
  end(): void;
}

export interface Tool<T=any> {
  name: string;
  description?: string;
  schema: any; // zod type at runtime
  handler: (args: T, ctx: Ctx) => Promise<unknown>;
}

export interface ToolRegistry {
  list(): Tool[];
  get(name: string): Tool | undefined;
  register(tool: Tool): void;
}

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
