import { Middleware } from "./compose.js";
import type {
  AssistantMessage,
  Ctx,
  ExecuteOptions,
  ExecuteResult,
  ExecuteStreamEvent,
  ExecuteStreamOptions,
  GenerateOptions,
  Logger,
  Message,
  Memory,
  ModelEvent,
  TokenStream,
  Tool,
  ToolCall,
  ToolChoice,
  ToolContext,
  ToolExecutionRecord,
  ToolRegistry,
  Usage,
  LLM,
  ModelResponse,
} from "./types.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

function parseLogLevelRaw(level: string): LogLevel | undefined {
  switch (level.toLowerCase()) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      return undefined;
  }
}

export function parseLogLevel(level: string | undefined): LogLevel | undefined {
  if (!level) return undefined;
  return parseLogLevelRaw(level);
}

const order: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function nowTs() {
  const d = new Date();
  const pad = (n: number, s = 2) => String(n).padStart(s, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createConsoleLogger(
  opts: { level?: LogLevel; timestamps?: boolean } = {},
): Logger {
  const envLevel = parseLogLevel(process.env.LOG_LEVEL);
  const level: LogLevel = opts.level ?? envLevel ?? "info";
  const showTs = opts.timestamps ?? true;
  const enabled = (lvl: LogLevel) => order[lvl] >= order[level];
  const prefix = (lvl: LogLevel) =>
    (showTs ? `[${nowTs()}] ` : "") + `[${lvl}]`;
  return {
    debug: (...a) => {
      if (enabled("debug")) console.debug(prefix("debug"), ...a);
    },
    info: (...a) => {
      if (enabled("info")) console.info(prefix("info"), ...a);
    },
    warn: (...a) => {
      if (enabled("warn")) console.warn(prefix("warn"), ...a);
    },
    error: (...a) => {
      if (enabled("error")) console.error(prefix("error"), ...a);
    },
    span: (name, attrs) => {
      if (enabled("info"))
        console.info(
          (showTs ? `[${nowTs()}] ` : "") + "[span]",
          name,
          attrs ?? {},
        );
    },
  };
}

// Backward-compatible always-on logger
export const consoleLogger: Logger = createConsoleLogger({
  level: parseLogLevel(process.env.LOG_LEVEL) ?? "debug",
});

export interface TraceEvent {
  level: LogLevel | "span";
  ts: string;
  args: unknown[];
}

export function createTracingLogger(base: Logger = createConsoleLogger()): {
  logger: Logger;
  getTrace: () => TraceEvent[];
  reset: () => void;
} {
  const events: TraceEvent[] = [];
  const push = (level: TraceEvent["level"], ...args: unknown[]) => {
    events.push({ level, ts: new Date().toISOString(), args });
  };
  const logger: Logger = {
    debug: (...a) => {
      push("debug", ...a);
      base.debug?.(...a);
    },
    info: (...a) => {
      push("info", ...a);
      base.info?.(...a);
    },
    warn: (...a) => {
      push("warn", ...a);
      base.warn?.(...a);
    },
    error: (...a) => {
      push("error", ...a);
      base.error?.(...a);
    },
    span: (name, attrs) => {
      push("span", name, attrs ?? {});
      base.span?.(name, attrs);
    },
  };
  return {
    logger,
    getTrace: () => events.slice(),
    reset: () => {
      events.length = 0;
    },
  };
}

export interface RedactOptions {
  keys?: string[]; // case-insensitive match of key names to redact
  mask?: string; // replacement for sensitive values
  patterns?: RegExp[]; // regex patterns to match sensitive values
}

const DEFAULT_SENSITIVE_KEYS = [
  "api_key",
  "apikey",
  "apiKey",
  "authorization",
  "auth",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "passwd",
  "secret",
  "x-api-key",
  "openai_api_key",
];

// Default patterns for detecting common sensitive data formats
const DEFAULT_PATTERNS = [
  /sk-[a-zA-Z0-9]{32,}/, // OpenAI-style keys
  /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, // JWT tokens
  /ghp_[a-zA-Z0-9]{36}/, // GitHub Personal Access Token
  /gho_[a-zA-Z0-9]{36}/, // GitHub OAuth Access Token
  /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/, // GitHub fine-grained PAT
  /glpat-[a-zA-Z0-9_-]{20}/, // GitLab Personal Access Token
  /AIza[0-9A-Za-z_-]{35}/, // Google API Key
  /ya29\.[0-9A-Za-z_-]+/, // Google OAuth Access Token
  /AKIA[0-9A-Z]{16}/, // AWS Access Key ID
  /xox[baprs]-[0-9a-zA-Z-]{10,}/, // Slack tokens
];

function matchesPattern(value: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(value)) return true;
  }
  return false;
}

function redactObject(
  input: unknown,
  keysSet: Set<string>,
  patterns: RegExp[],
  mask: string,
): unknown {
  if (input === null || input === undefined) return input;
  // Preserve Error objects with useful fields
  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }
  if (Array.isArray(input)) {
    return input.map((v) => redactObject(v, keysSet, patterns, mask));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = keysSet.has(k.toLowerCase())
        ? mask
        : redactObject(v, keysSet, patterns, mask);
    }
    return out;
  }
  // Check string values against patterns
  if (typeof input === "string" && matchesPattern(input, patterns)) {
    return mask;
  }
  return input;
}

function redactArgs(
  args: unknown[],
  keysSet: Set<string>,
  patterns: RegExp[],
  mask: string,
): unknown[] {
  return args.map((arg) => redactObject(arg, keysSet, patterns, mask));
}

export function redactSensitive(
  input: unknown,
  opts: RedactOptions = {},
): unknown {
  const envKeys = (process.env.LOG_REDACT_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const keys = (
    opts.keys && opts.keys.length ? opts.keys : DEFAULT_SENSITIVE_KEYS
  ).concat(envKeys);
  const keysSet = new Set(keys.map((k) => k.toLowerCase()));
  const patterns = opts.patterns ?? DEFAULT_PATTERNS;
  const mask = opts.mask ?? "***REDACTED***";
  return redactObject(input, keysSet, patterns, mask);
}

export function createRedactingLogger(
  base: Logger,
  opts: RedactOptions = {},
): Logger {
  const envKeys = (process.env.LOG_REDACT_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const keys = (
    opts.keys && opts.keys.length ? opts.keys : DEFAULT_SENSITIVE_KEYS
  ).concat(envKeys);
  const keysSet = new Set(keys.map((k) => k.toLowerCase()));
  const patterns = opts.patterns ?? DEFAULT_PATTERNS;
  const mask = opts.mask ?? "***REDACTED***";
  return {
    debug: (...a) => base.debug(...redactArgs(a, keysSet, patterns, mask)),
    info: (...a) => base.info(...redactArgs(a, keysSet, patterns, mask)),
    warn: (...a) => base.warn(...redactArgs(a, keysSet, patterns, mask)),
    error: (...a) => base.error(...redactArgs(a, keysSet, patterns, mask)),
    span: (name, attrs) =>
      base.span?.(
        name,
        redactObject(attrs, keysSet, patterns, mask) as
          | Record<string, unknown>
          | undefined,
      ),
  };
}

export class InMemoryKV implements Memory {
  private m = new Map<string, unknown>();
  async get<T = unknown>(key: string) {
    return this.m.get(key) as T | undefined;
  }
  async set(key: string, val: unknown) {
    this.m.set(key, val);
  }
  retrieval(index: string) {
    const docs = (this.m.get(`retrieval:${index}`) as string[]) ?? [];
    return {
      search: async (q: string, topK = 4) => {
        const scored = docs.map((t) => ({
          text: t,
          score: t.toLowerCase().includes(q.toLowerCase()) ? 1 : 0,
        }));
        return scored.sort((a, b) => b.score - a.score).slice(0, topK);
      },
    };
  }
}

export class NullStream implements TokenStream {
  write(_t: string) {}
  end() {}
}

export const stdoutStream: TokenStream = {
  write: (t: string) => {
    process.stdout.write(t);
  },
  end: () => {
    process.stdout.write("\n");
  },
};

export const inputToMessage: Middleware = async (ctx, next) => {
  if (ctx.input) ctx.messages.push({ role: "user", content: ctx.input });
  await next();
};

export function bufferStream() {
  let buf = "";
  return {
    stream: {
      write: (t: string) => {
        buf += t;
      },
      end: () => {},
    },
    getText: () => buf,
  };
}

export function getExecutionResult(
  ctx: Pick<Ctx, "state">,
): ExecuteResult | undefined {
  return ctx.state.executionResult as ExecuteResult | undefined;
}

export function getExecutionEvents(
  ctx: Pick<Ctx, "state">,
): ExecuteStreamEvent[] {
  const events = ctx.state.executionEvents;
  return Array.isArray(events) ? (events as ExecuteStreamEvent[]) : [];
}

export function teeStream(...streams: TokenStream[]): TokenStream {
  return {
    write: (t: string) => {
      for (const s of streams) s.write(t);
    },
    end: () => {
      for (const s of streams) s.end();
    },
  };
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value
  );
}

function hasParseSchema(
  schema: unknown,
): schema is { parse: (input: unknown) => unknown } {
  if (!schema || typeof schema !== "object") return false;
  const maybeSchema = schema as { parse?: unknown };
  return typeof maybeSchema.parse === "function";
}

function normalizeToolArguments(args: unknown): unknown {
  if (typeof args !== "string") return args;
  let current: unknown = args;
  for (let i = 0; i < 2; i++) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!trimmed) return args;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return current;
    }
  }
  return current;
}

function safeStableStringify(v: unknown): string {
  try {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      const obj: Record<string, unknown> = {};
      for (const k of keys) obj[k] = (v as Record<string, unknown>)[k];
      return JSON.stringify(obj);
    }
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function applyAliasesToTools(
  tools: Tool[],
  aliasMap?: Map<string, string>,
): { aliasedTools: Tool[]; reverseMap: Map<string, string> } {
  if (!aliasMap || aliasMap.size === 0) {
    const reverseMap = new Map<string, string>();
    for (const tool of tools) reverseMap.set(tool.name, tool.name);
    return { aliasedTools: tools, reverseMap };
  }

  const aliasedTools: Tool[] = [];
  const reverseMap = new Map<string, string>();
  for (const tool of tools) {
    const alias = aliasMap.get(tool.name);
    if (alias) {
      aliasedTools.push({ ...tool, name: alias });
      reverseMap.set(alias, tool.name);
    } else {
      aliasedTools.push(tool);
      reverseMap.set(tool.name, tool.name);
    }
  }
  return { aliasedTools, reverseMap };
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("EXECUTION_CANCELLED");
  }
}

function pushToolExecution(
  ctx: Pick<Ctx, "state">,
  record: ToolExecutionRecord,
): void {
  const existing = ctx.state.toolExecutions;
  if (Array.isArray(existing)) {
    existing.push(record);
    return;
  }
  ctx.state.toolExecutions = [record];
}

type ToolCallShape = {
  id?: string;
  name: string;
  arguments: unknown;
};

type ToolRoundEvent =
  | { type: "tool_call_started"; call: ToolCall; round: number }
  | {
      type: "tool_call_finished";
      call: ToolCall;
      round: number;
      result: unknown;
    };

interface ExecutePreparation {
  rounds: number;
  usage?: Usage;
  finalMessage: AssistantMessage;
  toolExecutions: ToolExecutionRecord[];
  toolEvents: ToolRoundEvent[];
}

function effectiveToolChoice(
  configured: ToolChoice | undefined,
  hasTools: boolean,
): ToolChoice {
  if (configured) return configured;
  return hasTools ? "auto" : "none";
}

async function prepareExecution(
  ctx: Ctx,
  options: ExecuteOptions = {},
): Promise<ExecutePreparation> {
  const toolList = ctx.tools.list();
  const userAliases = ctx.state.toolAliases as Map<string, string> | undefined;
  const { aliasedTools, reverseMap } = applyAliasesToTools(toolList, userAliases);

  const strategy = options.strategy ?? "iterative";
  const maxRounds = options.maxRounds ?? (strategy === "single" ? 6 : 12);
  const parallelToolCalls = options.parallelToolCalls ?? false;

  let usage: Usage | undefined;
  let toolChoice: ToolChoice = effectiveToolChoice(
    options.toolChoice,
    aliasedTools.length > 0,
  );
  const toolExecutions: ToolExecutionRecord[] = [];
  const toolEvents: ToolRoundEvent[] = [];

  for (let round = 0; round < maxRounds; round++) {
    assertNotAborted(ctx.signal);

    const genOpts: GenerateOptions = {
      toolChoice,
      signal: ctx.signal,
      parallelToolCalls,
    };

    if (toolChoice !== "none" && aliasedTools.length > 0) {
      genOpts.tools = aliasedTools;
    }

    const out = await ctx.model.generate(ctx.messages, genOpts);
    if (isAsyncIterable(out)) {
      throw new Error(
        "[execute] model returned a stream for non-streaming round",
      );
    }

    usage = out.usage ?? usage;
    const msg = out.message;
    const toolCalls = (
      msg as Message & { tool_calls?: ToolCallShape[] }
    ).tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return {
        rounds: round + 1,
        usage,
        finalMessage: msg,
        toolExecutions,
        toolEvents,
      };
    }

    ctx.messages.push(msg);
    const cache = new Map<string, unknown>();
    const lastArgsByName = new Map<string, unknown>();

    for (let i = 0; i < toolCalls.length; i++) {
      assertNotAborted(ctx.signal);
      const call = toolCalls[i] as ToolCallShape;
      const callId = call.id ?? `tool-call-${round + 1}-${i + 1}`;
      const providedArgs =
        typeof call.arguments === "undefined" && lastArgsByName.has(call.name)
          ? lastArgsByName.get(call.name)
          : call.arguments;
      const normalizedCall: ToolCall = {
        id: callId,
        name: call.name,
        arguments: providedArgs,
      };
      toolEvents.push({ type: "tool_call_started", call: normalizedCall, round: round + 1 });

      const canonicalName = reverseMap.get(call.name);
      if (!canonicalName) throw new Error(`Unknown tool: ${call.name}`);
      const tool = ctx.tools.get(canonicalName);
      if (!tool) throw new Error(`Unknown tool: ${canonicalName}`);

      const cacheKey = `${call.name}:${safeStableStringify(providedArgs)}`;
      let result = cache.get(cacheKey);
      let parsedArgs = lastArgsByName.get(call.name);

      if (typeof result === "undefined") {
        const normalizedArgs = normalizeToolArguments(providedArgs);
        parsedArgs = hasParseSchema(tool.schema)
          ? tool.schema.parse(normalizedArgs)
          : normalizedArgs;

        const toolCtx: ToolContext = {
          memory: ctx.memory,
          signal: ctx.signal,
          log: ctx.log,
          model: ctx.model,
          deps: ctx.state?.toolDeps as Record<string, unknown> | undefined,
        };

        result = await tool.handler(parsedArgs as never, toolCtx);
        cache.set(cacheKey, result);
        lastArgsByName.set(call.name, parsedArgs);
      }

      const toolMsg: Message = {
        role: "tool",
        tool_call_id: callId,
        name: call.name,
        content: JSON.stringify(result),
      };
      ctx.messages.push(toolMsg);

      const record: ToolExecutionRecord = {
        aliasName: call.name,
        canonicalName,
        callId,
        args: parsedArgs,
        result,
      };
      toolExecutions.push(record);
      pushToolExecution(ctx, record);
      toolEvents.push({
        type: "tool_call_finished",
        call: normalizedCall,
        round: round + 1,
        result,
      });
    }

    toolChoice = strategy === "single" ? "none" : "auto";
  }

  throw new Error(`[execute] exceeded max rounds (${maxRounds})`);
}

async function runExecute(
  ctx: Ctx,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  assertNotAborted(ctx.signal);
  const prepared = await prepareExecution(ctx, options);
  assertNotAborted(ctx.signal);
  ctx.messages.push(prepared.finalMessage);
  return {
    message: prepared.finalMessage,
    text: prepared.finalMessage.content,
    usage: prepared.usage,
    rounds: prepared.rounds,
    toolExecutions: prepared.toolExecutions,
  };
}

async function* streamExecution(
  ctx: Ctx,
  options: ExecuteStreamOptions = {},
): AsyncGenerator<ExecuteStreamEvent> {
  const sink = options.sink ?? ctx.stream;
  try {
    assertNotAborted(ctx.signal);
    const hasTools = ctx.tools.list().length > 0;
    const initialToolChoice = effectiveToolChoice(options.toolChoice, hasTools);
    const prepared =
      initialToolChoice === "none"
        ? {
            rounds: 0,
            usage: undefined,
            finalMessage: { role: "assistant", content: "" } as AssistantMessage,
            toolExecutions: [] as ToolExecutionRecord[],
            toolEvents: [] as ToolRoundEvent[],
          }
        : await prepareExecution(ctx, options);

    for (const event of prepared.toolEvents) {
      yield event;
    }

    assertNotAborted(ctx.signal);
    const out = await ctx.model.generate(ctx.messages, {
      stream: true,
      toolChoice: "none",
      signal: ctx.signal,
    });

    let usage = prepared.usage;
    let streamedText = "";
    let assistantMessage: AssistantMessage | undefined;

    if (isAsyncIterable(out)) {
      for await (const event of out as AsyncIterable<ModelEvent>) {
        assertNotAborted(ctx.signal);
        if (event.type === "token") {
          streamedText += event.token;
          sink.write(event.token);
          yield { type: "token", token: event.token };
        } else if (event.type === "assistant_message") {
          assistantMessage = event.message;
          yield event;
        } else if (event.type === "usage") {
          usage = event.usage;
          yield event;
        }
      }
    } else {
      assistantMessage = out.message;
      usage = out.usage ?? usage;
      if (assistantMessage.content) {
        streamedText = assistantMessage.content;
        sink.write(assistantMessage.content);
        yield { type: "token", token: assistantMessage.content };
      }
    }

    const finalMessage: AssistantMessage = assistantMessage ?? {
      role: "assistant",
      content: streamedText,
    };
    ctx.messages.push(finalMessage);
    sink.end();

    const result: ExecuteResult = {
      message: finalMessage,
      text: finalMessage.content,
      usage,
      rounds: prepared.rounds + 1,
      toolExecutions: prepared.toolExecutions,
    };

    if (!assistantMessage) {
      yield { type: "assistant_message", message: finalMessage };
    }
    yield { type: "done", result };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    yield { type: "error", error: err };
    throw err;
  }
}

export const executeWith =
  (options: ExecuteOptions = {}): Middleware =>
  async (ctx, next) => {
    await next();
    const result = await runExecute(ctx, options);
    ctx.state.executionResult = result;
  };

export const execute: Middleware = executeWith();

export const executeStreamWith =
  (options: ExecuteStreamOptions = {}): Middleware =>
  async (ctx, next) => {
    await next();
    const events: ExecuteStreamEvent[] = [];
    let result: ExecuteResult | undefined;
    try {
      for await (const event of streamExecution(ctx, options)) {
        events.push(event);
        if (event.type === "done") result = event.result;
      }
    } finally {
      ctx.state.executionEvents = events;
      if (result) ctx.state.executionResult = result;
    }
  };

export const executeStream: Middleware = executeStreamWith();

export const streamOnce: Middleware = async (c: Ctx) => {
  const out = await c.model.generate(c.messages, {
    stream: true,
    toolChoice: "none",
    signal: c.signal,
  });

  const stream = out as unknown as AsyncIterable<unknown> | ModelResponse;
  if (
    stream &&
    typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      "function"
  ) {
    for await (const ev of stream as AsyncIterable<unknown>) {
      if (ev && typeof ev === "object") {
        const event = ev as {
          type?: string;
          token?: string;
          message?: unknown;
        };
        if (event.type === "token" && typeof event.token === "string") {
          c.stream.write(event.token);
        } else if (event.type === "assistant_message" && event.message) {
          c.messages.push(event.message as unknown as Ctx["messages"][number]);
        }
      }
    }
    c.stream.end();
  } else if (out?.message) {
    c.messages.push(out.message);
    c.stream.write(out.message.content);
    c.stream.end();
  }
};

export class SimpleTools implements ToolRegistry {
  private tools = new Map<string, Tool>();
  list() {
    return Array.from(this.tools.values());
  }
  get(name: string) {
    return this.tools.get(name);
  }
  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }
}

// --- Context factory ---

export interface CreateCtxOptions {
  model: LLM; // Required - the only essential piece
  input?: string;
  systemPrompt?: string;
  logLevel?: LogLevel;
  timestamps?: boolean; // For logger
  signal?: globalThis.AbortSignal;
  tools?: Tool[] | ToolRegistry; // Accept array OR ToolRegistry instance
  memory?: Memory;
  stream?: TokenStream;
  state?: Record<string, unknown>; // Allow initial state
}

/**
 * Factory function to create a Ctx object with sensible defaults.
 * Reduces boilerplate by providing defaults for all optional fields.
 *
 * @example
 * ```ts
 * const ctx = createCtx({
 *   model: openAIAdapter({ model: 'gpt-5.4' }),
 *   input: 'Hello',
 *   systemPrompt: 'You are a helpful assistant',
 *   logLevel: 'debug'
 * });
 * ```
 */
export function createCtx(options: CreateCtxOptions): Ctx {
  const messages: Message[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  // Handle tools - accept either array or registry
  let toolRegistry: ToolRegistry;
  if (options.tools) {
    if (Array.isArray(options.tools)) {
      toolRegistry = new SimpleTools();
      options.tools.forEach((t) => toolRegistry.register(t));
    } else {
      toolRegistry = options.tools;
    }
  } else {
    toolRegistry = new SimpleTools();
  }

  return {
    input: options.input,
    messages,
    model: options.model,
    tools: toolRegistry,
    memory: options.memory ?? new InMemoryKV(),
    stream: options.stream ?? new NullStream(),
    state: options.state ?? {},
    signal: options.signal ?? new globalThis.AbortController().signal,
    log: createConsoleLogger({
      level: options.logLevel ?? "info",
      timestamps: options.timestamps,
    }),
  };
}

// --- CLI helpers ---
export type FlagMap = Record<string, string | boolean>;

export function parseFlags(argv: string[] = process.argv): FlagMap {
  const out: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith("--")) continue;
    const k = a.slice(2);
    const eq = k.indexOf("=");
    if (eq >= 0) {
      const key = k.slice(0, eq);
      const val = k.slice(eq + 1);
      out[key] = val;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[k] = next;
      i++;
    } else {
      out[k] = true;
    }
  }
  return out;
}

function kebabForEnv(envName: string): string {
  return envName.toLowerCase().replace(/_/g, "-");
}

// Given a list of env var names (e.g., ['OPENAI_API_KEY','API_KEY']), returns values with precedence: CLI flag > env
export function configFromFlagsAndEnv(
  envVars: string[],
  flags: FlagMap = parseFlags(),
  env: typeof process.env = process.env,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const name of envVars) {
    const flag = kebabForEnv(name);
    const cliVal = (flags[flag] as string | undefined) ?? undefined;
    out[name] = cliVal ?? env[name];
  }
  return out;
}

// Helper to pick the first defined value out of a set of env names, respecting CLI-over-env precedence
export function firstConfigValue(
  names: string[],
  flags: FlagMap = parseFlags(),
  env: typeof process.env = process.env,
): string | undefined {
  for (const n of names) {
    const flag = kebabForEnv(n);
    const cliVal = (flags[flag] as string | undefined) ?? undefined;
    if (cliVal !== undefined) return cliVal;
    const envVal = env[n];
    if (envVal !== undefined) return envVal;
  }
  return undefined;
}
