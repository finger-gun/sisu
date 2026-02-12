import { Middleware } from "./compose.js";
import type {
  Ctx,
  Logger,
  Memory,
  TokenStream,
  Tool,
  ToolRegistry,
  LLM,
  Message,
} from "./types.js";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = {
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
  opts: { level?: Level; timestamps?: boolean } = {},
): Logger {
  const envLevel = (
    process.env.LOG_LEVEL as Level | undefined
  )?.toLowerCase() as Level | undefined;
  const level: Level = opts.level ?? envLevel ?? "info";
  const showTs = opts.timestamps ?? true;
  const enabled = (lvl: Level) => order[lvl] >= order[level];
  const prefix = (lvl: Level) => (showTs ? `[${nowTs()}] ` : "") + `[${lvl}]`;
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
  level: (process.env.LOG_LEVEL as Level | undefined) ?? "debug",
});

export interface TraceEvent {
  level: Level | "span";
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
  input: any,
  keysSet: Set<string>,
  patterns: RegExp[],
  mask: string,
): any {
  if (input === null || input === undefined) return input;
  // Preserve Error objects with useful fields
  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }
  if (Array.isArray(input)) {
    return input.map((v) => redactObject(v, keysSet, patterns, mask));
  }
  if (typeof input === "object") {
    const out: Record<string, any> = {};
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
  return args.map((arg) => redactObject(arg as any, keysSet, patterns, mask));
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
  return redactObject(input as any, keysSet, patterns, mask);
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
      base.span?.(name, redactObject(attrs as any, keysSet, patterns, mask)),
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

export const streamOnce: Middleware = async (c: Ctx) => {
  const out: any = await c.model.generate(c.messages, {
    stream: true,
    toolChoice: "none",
    signal: c.signal,
  });

  if (out && typeof out[Symbol.asyncIterator] === "function") {
    for await (const ev of out as AsyncIterable<any>) {
      if (ev?.type === "token") c.stream.write(ev.token);
      else if (ev?.type === "assistant_message" && ev.message)
        c.messages.push(ev.message);
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
  logLevel?: Level;
  timestamps?: boolean; // For logger
  signal?: AbortSignal;
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
 *   model: openAIAdapter({ model: 'gpt-4o-mini' }),
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
    signal: options.signal ?? new AbortController().signal,
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
  env: NodeJS.ProcessEnv = process.env,
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
  env: NodeJS.ProcessEnv = process.env,
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
