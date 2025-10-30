# Sisu Core Package Review & Recommendations

**Review Date**: 2025-10-29  
**Reviewer**: Code Analysis  
**Version**: 1.1.2

## Executive Summary

The Sisu core package demonstrates excellent architectural decisions with its Koa-style middleware pattern and type-safe design. However, there are opportunities to enhance security, developer experience, and feature completeness while maintaining the framework's minimalist philosophy.

---

## 🔒 Security Improvements

### High Priority

#### 1. Fix Redaction Logic Bug
**Location**: [`util.ts:62-81`](packages/core/src/util.ts:62)

**Issue**: Duplicate array check in `redactObject` function (line 69-70).

```typescript
// Current (buggy):
if (Array.isArray(input)) return input.map(v => redactObject(v, keysSet, mask));
if (typeof input === 'object') {
  const out: any = Array.isArray(input) ? [] : {};  // Duplicate check!
```

**Recommendation**:
```typescript
function redactObject(input: any, keysSet: Set<string>, mask: string): any {
  if (input === null || input === undefined) return input;
  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }
  if (Array.isArray(input)) {
    return input.map(v => redactObject(v, keysSet, mask));
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = keysSet.has(k.toLowerCase()) ? mask : redactObject(v, keysSet, mask);
    }
    return out;
  }
  return input;
}
```

#### 2. Add Sensitive Data Detection
**Priority**: High

**Issue**: Redaction only works on known key names, not on patterns or values.

**Recommendation**: Add regex-based value detection for common sensitive patterns:
```typescript
export interface RedactOptions {
  keys?: string[];
  mask?: string;
  patterns?: RegExp[];  // NEW: Redact values matching patterns
}

// Detect API keys, tokens, JWT, etc.
const DEFAULT_PATTERNS = [
  /sk-[a-zA-Z0-9]{32,}/,  // OpenAI-style keys
  /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,  // JWT tokens
];
```

#### 3. Tool Handler Sandboxing
**Priority**: Medium
**Status**: ✅ **COMPLETED**

**Issue**: Tool handlers have full access to `ctx` with no restrictions.

**Implementation**: Created `ToolContext` interface with restricted properties:
```typescript
export interface ToolContext {
  readonly memory: Memory;
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly model: LLM;
  readonly deps?: Record<string, unknown>;  // For dependency injection
}

export interface Tool<TArgs = any, TResult = unknown> {
  name: string;
  description?: string;
  schema: any;
  handler: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}
```

**Changes made**:
- Created `ToolContext` interface in [`types.ts`](packages/core/src/types.ts:115-136)
- Updated `Tool` interface to use `ToolContext` instead of `Ctx`
- Modified tool-calling middleware to create restricted context before invoking handlers
- Tool-calling middleware passes `ctx.state.toolDeps` as `ctx.deps` for proper dependency injection
- Updated all existing tool implementations (wikipedia, github-projects, summarize-text, terminal, aws-s3, etc.)
- Added comprehensive tests verifying sandboxing works correctly
- Updated documentation in core README

**Key decisions**:
- Included `model` in `ToolContext` to support meta-tools (e.g., `summarizeText` needs to call LLM)
- Tool handlers naturally pass `toolChoice: 'none'` when using model, preventing recursive tool calling
- Added `deps` property for proper dependency injection pattern instead of abusing `memory`
  - Tools access injected dependencies via `ctx.deps?.dependencyName`
  - Middleware/tests provide dependencies via `ctx.state.toolDeps = { ... }`
  - Keeps semantic separation: `memory` for persistence, `deps` for configuration/testing

**Security improvements**:
- Tools cannot call other tools (no `tools` registry access)
- Tools cannot manipulate conversation history (no `messages` access)
- Tools cannot access middleware state (no `state` access)
- Tools cannot interfere with user I/O (no `input`/`stream` access)

#### 4. Input Validation for Compose
**Priority**: Medium

**Issue**: No validation that middleware array is valid.

**Recommendation**:
```typescript
export function compose<C extends Ctx>(stack: Middleware<C>[]) {
  if (!Array.isArray(stack)) {
    throw new TypeError('Middleware stack must be an array');
  }
  if (stack.some(fn => typeof fn !== 'function')) {
    throw new TypeError('Middleware must be composed of functions');
  }
  // ... rest of implementation
}
```

---

## 🎯 UX/DX Improvements

### High Priority

#### 1. Add Ctx Factory/Builder
**Issue**: Creating `Ctx` requires verbose boilerplate in every example.

**Recommendation**: Add a factory function:
```typescript
export interface CreateCtxOptions {
  input?: string;
  systemPrompt?: string;
  model: LLM;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  signal?: AbortSignal;
  tools?: Tool[];
  memory?: Memory;
  stream?: TokenStream;
}

export function createCtx(options: CreateCtxOptions): Ctx {
  const messages: Message[] = [];
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  
  const tools = new SimpleTools();
  options.tools?.forEach(t => tools.register(t));
  
  return {
    input: options.input,
    messages,
    model: options.model,
    tools,
    memory: options.memory ?? new InMemoryKV(),
    stream: options.stream ?? new NullStream(),
    state: {},
    signal: options.signal ?? new AbortController().signal,
    log: createConsoleLogger({ level: options.logLevel ?? 'info' }),
  };
}
```

**Usage becomes**:
```typescript
const ctx = createCtx({
  input: 'Hello',
  systemPrompt: 'You are helpful',
  model: openAIAdapter({ model: 'gpt-4o-mini' }),
  logLevel: 'debug'
});
```

#### 2. Add JSDoc Documentation
**Issue**: Public APIs lack documentation.

**Recommendation**: Add comprehensive JSDoc to all exports:
```typescript
/**
 * Composes an array of middleware functions into a single handler.
 * 
 * Middleware executes in order, with each able to run code before and after
 * calling `next()`. This creates an "onion" pattern where earlier middleware
 * wraps later middleware.
 * 
 * @param stack - Array of middleware functions to compose
 * @returns A composed handler function
 * @throws {TypeError} If stack is not an array or contains non-functions
 * @throws {Error} If a middleware calls next() multiple times
 * 
 * @example
 * ```ts
 * const handler = compose([
 *   async (ctx, next) => { console.log('before'); await next(); console.log('after'); },
 *   async (ctx) => { console.log('inner'); }
 * ]);
 * // Logs: before, inner, after
 * ```
 */
export function compose<C extends Ctx>(stack: Middleware<C>[]) {
  // ...
}
```

#### 3. Better Error Types
**Issue**: Generic errors make debugging harder.

**Recommendation**: Create specific error classes:
```typescript
export class SisuError extends Error {
  constructor(message: string, public readonly code: string, public readonly context?: unknown) {
    super(message);
    this.name = 'SisuError';
  }
}

export class MiddlewareError extends SisuError {
  constructor(message: string, public readonly middlewareIndex: number, cause?: Error) {
    super(message, 'MIDDLEWARE_ERROR', { middlewareIndex, cause });
    this.name = 'MiddlewareError';
  }
}

export class ToolExecutionError extends SisuError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly args: unknown,
    cause?: Error
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', { toolName, args, cause });
    this.name = 'ToolExecutionError';
  }
}
```

#### 4. Improve Logger Interface
**Issue**: Logger doesn't support structured logging metadata.

**Recommendation**:
```typescript
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>, error?: Error): void;
  span?(name: string, attrs?: Record<string, unknown>): void;
}
```

---

## 🚀 Feature Enhancements

### High Priority

#### 1. Add Timeout Utilities
**Rationale**: Timeouts are critical for production reliability.

**Recommendation**:
```typescript
export interface TimeoutOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  onTimeout?: (elapsed: number) => void;
}

export function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        options.onTimeout?.(options.timeoutMs);
        reject(new SisuError(
          `Operation timed out after ${options.timeoutMs}ms`,
          'TIMEOUT'
        ));
      }, options.timeoutMs);
      
      options.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new SisuError('Operation aborted', 'ABORTED'));
      });
    })
  ]);
}

// Middleware helper
export function timeout(ms: number): Middleware {
  return async (ctx, next) => {
    await withTimeout(next(), { timeoutMs: ms, signal: ctx.signal });
  };
}
```

#### 2. Add Retry Logic
**Rationale**: LLM APIs can be flaky; retries are essential.

**Recommendation**:
```typescript
export interface RetryOptions {
  maxAttempts: number;
  delayMs?: number;
  backoff?: 'exponential' | 'linear' | 'constant';
  shouldRetry?: (error: Error, attempt: number) => boolean;
  signal?: AbortSignal;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delayMs = 1000, backoff = 'exponential', shouldRetry, signal } = options;
  
  let lastError: Error;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new SisuError('Operation aborted', 'ABORTED');
      }
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) break;
      if (shouldRetry && !shouldRetry(lastError, attempt)) break;
      
      const delay = backoff === 'exponential' 
        ? delayMs * Math.pow(2, attempt - 1)
        : backoff === 'linear'
        ? delayMs * attempt
        : delayMs;
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new SisuError(
    `Failed after ${maxAttempts} attempts`,
    'MAX_RETRIES_EXCEEDED',
    { lastError }
  );
}
```

#### 3. Add Ctx Cloning
**Rationale**: Needed for parallel middleware execution or testing.

**Recommendation**:
```typescript
export function cloneCtx<C extends Ctx = Ctx>(ctx: C, overrides?: Partial<C>): C {
  return {
    ...ctx,
    messages: [...ctx.messages],
    state: { ...ctx.state },
    ...overrides,
  } as C;
}
```

#### 4. Immutable Tool Registry
**Rationale**: Prevent accidental mutation during execution.

**Recommendation**:
```typescript
export class ImmutableToolRegistry implements ToolRegistry {
  constructor(private readonly tools: ReadonlyMap<string, Tool>) {}
  
  list(): Tool[] { return Array.from(this.tools.values()); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
  
  register(_tool: Tool): never {
    throw new Error('Cannot register tools on an immutable registry');
  }
  
  static from(tools: Tool[]): ImmutableToolRegistry {
    return new ImmutableToolRegistry(new Map(tools.map(t => [t.name, t])));
  }
}
```

### Medium Priority

#### 5. Enhanced Memory Interface
**Issue**: No TTL, size limits, or cache eviction.

**Recommendation**:
```typescript
export interface MemoryOptions {
  maxSize?: number;
  ttlMs?: number;
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
}

export interface EnhancedMemory extends Memory {
  size(): Promise<number>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
}
```

#### 6. Middleware Composition Helpers
**Recommendation**:
```typescript
// Run middleware in parallel (for independent operations)
export function parallel<C extends Ctx>(...middlewares: Middleware<C>[]): Middleware<C> {
  return async (ctx, next) => {
    await Promise.all(middlewares.map(mw => mw(cloneCtx(ctx), async () => {})));
    await next();
  };
}

// Conditional middleware execution
export function when<C extends Ctx>(
  predicate: (ctx: C) => boolean,
  middleware: Middleware<C>
): Middleware<C> {
  return async (ctx, next) => {
    if (predicate(ctx)) {
      await middleware(ctx, next);
    } else {
      await next();
    }
  };
}

// Run middleware in sequence (explicit ordering)
export function sequence<C extends Ctx>(...middlewares: Middleware<C>[]): Middleware<C> {
  return compose(middlewares);
}
```

---

## 📊 Code Quality Improvements

### High Priority

#### 1. Split util.ts
**Issue**: Single file has too many responsibilities (218 lines).

**Recommendation**: Split into focused modules:
```
packages/core/src/
  ├── logging/
  │   ├── console-logger.ts
  │   ├── tracing-logger.ts
  │   └── redacting-logger.ts
  ├── memory/
  │   └── in-memory-kv.ts
  ├── streaming/
  │   ├── null-stream.ts
  │   ├── stdout-stream.ts
  │   └── stream-utils.ts
  ├── tools/
  │   └── simple-tools.ts
  └── cli/
      └── flags.ts
```

#### 2. Add Input Validation
**Recommendation**: Validate all public API inputs:
```typescript
export function parseFlags(argv: string[] = process.argv): FlagMap {
  if (!Array.isArray(argv)) {
    throw new TypeError('argv must be an array');
  }
  // ... rest
}
```

#### 3. Improve Test Coverage
**Current**: Only `agent.test.ts` and `compose.test.ts`

**Recommendation**: Add tests for:
- All util.ts functions (loggers, streams, tools, flags)
- Error conditions
- Edge cases (empty arrays, null values, etc.)
- Redaction logic (critical for security)

#### 4. Add Type Guards
**Recommendation**:
```typescript
export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const msg = value as any;
  return (
    typeof msg.role === 'string' &&
    ['user', 'assistant', 'system', 'tool'].includes(msg.role) &&
    typeof msg.content === 'string'
  );
}

export function isToolCall(value: unknown): value is ToolCall {
  if (!value || typeof value !== 'object') return false;
  const tc = value as any;
  return (
    typeof tc.id === 'string' &&
    typeof tc.name === 'string' &&
    tc.arguments !== undefined
  );
}
```

---

## 🔧 Breaking Changes to Consider (v2.0)

These would improve the framework but require major version bump:

### 1. Make Tool Handler Signature Consistent
**Current**: `handler: (args: TArgs, ctx: Ctx) => Promise<TResult>`  
**Proposed**: `handler: (args: TArgs, ctx: ToolContext) => Promise<TResult>`

### 2. Strengthen Logger Interface
**Current**: `...args: any[]`  
**Proposed**: Structured logging with message + metadata

### 3. Remove Legacy Logger Export
**Current**: Exports `consoleLogger` (always debug level)  
**Proposed**: Remove, force users to call `createConsoleLogger()`

---

## 📈 Metrics & Observability Gaps

### Recommendations

1. **Add Metrics Interface**:
```typescript
export interface Metrics {
  counter(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}

export class NoOpMetrics implements Metrics {
  counter() {}
  gauge() {}
  histogram() {}
  timing() {}
}
```

2. **Add to Ctx**:
```typescript
export interface Ctx {
  // ... existing fields
  metrics?: Metrics;  // Optional, defaults to NoOp
}
```

---

## 🎯 Priority Roadmap

### Immediate (v1.2.0)
1. ✅ Fix redaction bug
2. ✅ Add input validation to compose
3. ✅ Add JSDoc to public APIs
4. ✅ Add `createCtx` factory
5. ✅ Add timeout utilities
6. ✅ Add retry utilities

### Short-term (v1.3.0)
1. Add specific error types
2. Improve logger interface
3. Add ctx cloning
4. Split util.ts
5. Increase test coverage to 80%+

### Medium-term (v1.4.0)
1. Enhanced memory interface
2. Middleware composition helpers
3. Immutable tool registry
4. Type guards
5. Metrics interface

### Long-term (v2.0.0)
1. Breaking: Restrict tool handler context
2. Breaking: Structured logging
3. Breaking: Remove legacy exports

---

## 📝 Documentation Needs

1. **Architecture Guide**: Explain middleware execution model in depth
2. **Security Best Practices**: How to use redaction, handle secrets
3. **Testing Guide**: How to test middleware and tools
4. **Performance Guide**: Memory management, streaming best practices
5. **Migration Guides**: When breaking changes are introduced

---

## ✅ What's Already Great

- ✅ Clean separation of concerns
- ✅ Type safety with generics
- ✅ Minimal dependencies
- ✅ Composable design
- ✅ Provider-agnostic architecture
- ✅ Built-in observability
- ✅ Good testing infrastructure

---

## 🎓 Learning Resources Needed

For new users, create guides on:
1. Understanding middleware composition
2. Building custom tools
3. Creating custom adapters
4. Error handling patterns
5. Testing strategies
