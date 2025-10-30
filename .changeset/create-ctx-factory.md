---
"@sisu-ai/core": minor
---

Add `createCtx` factory function to simplify context creation with sensible defaults.

**New Feature:**
The `createCtx` function reduces boilerplate when creating `Ctx` objects by providing sensible defaults for all optional fields. Only the `model` parameter is required.

**Benefits:**
- Reduces context creation from 10+ lines to just a few
- Provides sensible defaults (InMemoryKV, NullStream, empty state, etc.)
- Maintains full flexibility - all options can be overridden
- Accepts both Tool arrays and ToolRegistry instances
- Simplifies examples and makes the library more approachable

**Example:**
```typescript
// Before
const ctx: Ctx = {
  input: 'Hello',
  messages: [{ role: 'system', content: 'You are helpful' }],
  model: openAIAdapter({ model: 'gpt-4o-mini' }),
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' }),
};

// After
const ctx = createCtx({
  model: openAIAdapter({ model: 'gpt-4o-mini' }),
  input: 'Hello',
  systemPrompt: 'You are helpful',
  logLevel: 'info'
});
```

**Options:**
- `model` (required) — LLM adapter instance
- `input` — User input message
- `systemPrompt` — System message prepended to conversation
- `logLevel` — Logger level ('debug' | 'info' | 'warn' | 'error')
- `timestamps` — Enable/disable timestamps in logs
- `signal` — AbortSignal for cancellation
- `tools` — Array of tools or ToolRegistry instance
- `memory` — Memory implementation (defaults to InMemoryKV)
- `stream` — TokenStream implementation (defaults to NullStream)
- `state` — Initial state object

This is a non-breaking addition - existing manual Ctx creation continues to work.