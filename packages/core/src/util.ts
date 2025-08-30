import type { Logger, Memory, TokenStream, Tool, ToolRegistry } from './types.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function nowTs() {
  const d = new Date();
  const pad = (n: number, s = 2) => String(n).padStart(s, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createConsoleLogger(opts: { level?: Level; timestamps?: boolean } = {}): Logger {
  const envLevel = (process.env.LOG_LEVEL as Level | undefined)?.toLowerCase() as Level | undefined;
  const level: Level = opts.level ?? envLevel ?? 'info';
  const showTs = opts.timestamps ?? true;
  const enabled = (lvl: Level) => order[lvl] >= order[level];
  const prefix = (lvl: Level) => (showTs ? `[${nowTs()}] ` : '') + `[${lvl}]`;
  return {
    debug: (...a) => { if (enabled('debug')) console.debug(prefix('debug'), ...a); },
    info:  (...a) => { if (enabled('info'))  console.info(prefix('info'),  ...a); },
    warn:  (...a) => { if (enabled('warn'))  console.warn(prefix('warn'),  ...a); },
    error: (...a) => { if (enabled('error')) console.error(prefix('error'), ...a); },
    span:  (name, attrs) => { if (enabled('info')) console.info((showTs ? `[${nowTs()}] ` : '') + '[span]', name, attrs ?? {}); },
  };
}

// Backward-compatible always-on logger
export const consoleLogger: Logger = createConsoleLogger({ level: (process.env.LOG_LEVEL as Level | undefined) ?? 'debug' });

export interface TraceEvent {
  level: Level | 'span';
  ts: string;
  args: unknown[];
}

export function createTracingLogger(base: Logger = createConsoleLogger()): { logger: Logger; getTrace: () => TraceEvent[]; reset: () => void } {
  const events: TraceEvent[] = [];
  const push = (level: TraceEvent['level'], ...args: unknown[]) => {
    events.push({ level, ts: new Date().toISOString(), args });
  };
  const logger: Logger = {
    debug: (...a) => { push('debug', ...a); base.debug?.(...a); },
    info:  (...a) => { push('info',  ...a); base.info?.(...a); },
    warn:  (...a) => { push('warn',  ...a); base.warn?.(...a); },
    error: (...a) => { push('error', ...a); base.error?.(...a); },
    span:  (name, attrs) => { push('span', name, attrs ?? {}); base.span?.(name, attrs); },
  };
  return { logger, getTrace: () => events.slice(), reset: () => { events.length = 0; } };
}

export interface RedactOptions {
  keys?: string[]; // case-insensitive match of key names to redact
  mask?: string;   // replacement for sensitive values
}

const DEFAULT_SENSITIVE_KEYS = [
  'api_key','apikey','apiKey','authorization','auth','token','access_token','refresh_token',
  'password','passwd','secret','x-api-key','openai_api_key'
];

function redactObject(input: any, keysSet: Set<string>, mask: string): any {
  if (input === null || input === undefined) return input;
  // Preserve Error objects with useful fields
  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }
  if (Array.isArray(input)) return input.map(v => redactObject(v, keysSet, mask));
  if (typeof input === 'object') {
    const out: any = Array.isArray(input) ? [] : {};
    for (const [k, v] of Object.entries(input)) {
      if (keysSet.has(k.toLowerCase())) {
        out[k] = mask;
      } else {
        out[k] = redactObject(v, keysSet, mask);
      }
    }
    return out;
  }
  return input;
}

function redactArgs(args: unknown[], keysSet: Set<string>, mask: string): unknown[] {
  return args.map(arg => redactObject(arg as any, keysSet, mask));
}

export function createRedactingLogger(base: Logger, opts: RedactOptions = {}): Logger {
  const envKeys = (process.env.LOG_REDACT_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  const keys = (opts.keys && opts.keys.length ? opts.keys : DEFAULT_SENSITIVE_KEYS).concat(envKeys);
  const keysSet = new Set(keys.map(k => k.toLowerCase()));
  const mask = opts.mask ?? '***REDACTED***';
  return {
    debug: (...a) => base.debug(...redactArgs(a, keysSet, mask)),
    info:  (...a) => base.info(...redactArgs(a, keysSet, mask)),
    warn:  (...a) => base.warn(...redactArgs(a, keysSet, mask)),
    error: (...a) => base.error(...redactArgs(a, keysSet, mask)),
    span:  (name, attrs) => base.span?.(name, redactObject(attrs as any, keysSet, mask)),
  };
}

export class InMemoryKV implements Memory {
  private m = new Map<string, unknown>();
  async get<T=unknown>(key: string) { return this.m.get(key) as T|undefined; }
  async set(key: string, val: unknown) { this.m.set(key, val); }
  retrieval(index: string) {
    const docs = (this.m.get(`retrieval:${index}`) as string[]) ?? [];
    return {
      search: async (q: string, topK = 4) => {
        const scored = docs.map(t => ({ text: t, score: t.toLowerCase().includes(q.toLowerCase()) ? 1 : 0 }));
        return scored.sort((a,b)=>b.score-a.score).slice(0, topK);
      }
    };
  }
}

export class NullStream implements TokenStream {
  write(_t: string) {}
  end() {}
}

export class SimpleTools implements ToolRegistry {
  private tools = new Map<string, Tool>();
  list() { return Array.from(this.tools.values()); }
  get(name: string) { return this.tools.get(name); }
  register(tool: Tool) { this.tools.set(tool.name, tool); }
}
