# AGENTS Guidelines for This Repository

## Project Overview
**Sisu** is a TypeScript framework for building reliable AI agents with full transparency and control.
This monorepo contains:
- **Core**: The main framework engine and types
- **Adapters**: Provider integrations (OpenAI, Anthropic, Ollama)
- **Middleware**: Composable functionality (tracing, tool-calling, error handling, etc.)
- **Tools**: Pre-built tools for common tasks (web search, file operations, etc.)
- **Vector**: Vector storage and retrieval capabilities
- **Server**: HTTP server implementation
- **Examples**: 25+ working examples demonstrating features

**Philosophy:** small, explicit, composable. Favor simple, testable building blocks (middleware, tools, adapters) over monoliths.

## Dev Environment Setup
- This monorepo uses **pnpm** and **Turbo** for fast, efficient builds and dependency management.
- **Node.js**: Requires >= 22.x
- **Package Manager**: Uses pnpm

### Initial Setup
```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install all workspace dependencies
pnpm install

# Build all packages
pnpm build
```

### Available Commands
- `pnpm build` - Build all packages with Turbo caching
- `pnpm test` - Run all tests across workspaces
- `pnpm test:coverage` - Run tests with coverage (target: ≥80%)
- `pnpm lint` - Lint all packages
- `pnpm typecheck` - Type check all packages
- `pnpm clean` - Clean all build artifacts
- `pnpm dev` - Run development mode (for server/examples)

### Working with Workspaces
- Use `pnpm --filter=<package-name> <command>` to run commands in specific packages
- Examples: `pnpm --filter=openai-hello dev`, `pnpm --filter=@sisu-ai/core build`
- Each package has its own README.md with specific documentation

## Running Examples
The repository includes 25+ examples demonstrating different capabilities.

## Testing Instructions
- **Test Framework**: Vitest MUST have ≥80% coverage target
- **CI/CD**: GitHub Actions (see `.github/workflows/`)
- **Commands**:
  - `pnpm test` - Run all tests
  - `pnpm test:coverage` - Run with coverage report
  - `pnpm vitest run -t "<test name>"` - Run specific test
- **Coverage**: Reports available in `./coverage/` directory
- **Always**: Add/update tests for any code changes, build and test before commits
- **NEVER**: Disable tests to meet coverage or to fix broken tests.

## Code Guidelines (TypeScript)

**Always keep runnable code**. Always build and test the code base when changes has been make.
**Never edit dist/ files**. Work on the source code, build the dist/.

### 1) Language & Linting

* Use **TypeScript** in **strict** mode. Avoid `any`; prefer `unknown` + narrowing.
* ESLint: follow the repo’s **recommended** rules. Fix all `--max-warnings=0`.
* Prefer **named exports** from each package; keep `default` exports for React-only files (if any).


### 3) Types & APIs

* Prefer **`type`** for unions/aliases, **`interface`** for object contracts that may be extended.
* Public API should be **stable and minimal**. Mark internal helpers `/** @internal */`.

### 4) Middleware Conventions

* Middleware signature: `(ctx, next) => Promise<void>`.
* **Always** call `await next()` unless intentionally short-circuiting.
* Don’t mutate unrelated parts of `ctx`. If you need state: **namespace** under `ctx.state.yourFeature`.
* Log via `ctx.log` (respect `LOG_LEVEL`); never `console.*` directly.
* Propagate cancellation: read and pass `ctx.signal` to I/O.

### 5) Tools (Function Calling)

* Define tools with **zod** schemas; validate inputs before running.
* Name tools clearly (`verbNoun`, e.g., `getWeather`), keep them **idempotent** and side-effect free.
* Return small, serializable results; avoid embedding huge blobs.

```ts
import { z } from 'zod';

export const getWeather = {
  name: 'getWeather',
  description: 'Get weather for a city',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({ city, tempC: 21, summary: 'Sunny' }),
};
```

### 6) Adapters (LLM)

* Implement `generate(messages, opts)`; support non-streaming and (if applicable) streaming via `AsyncIterable`.
* Respect `opts.tools`, `opts.toolChoice` (`'auto' | 'none'`), and surface `usage` if the provider returns it.
* Never leak provider secrets in logs; rely on the redacting logger.

### 7) Errors & Guardrails

* Throw real `Error` objects with helpful messages; include `cause` when wrapping.
* No catch-and-silence: either handle or rethrow to the **error boundary** middleware.

### 8) Tests

* **Vitest** with target **≥ 80%** coverage.
* Mock external I/O; keep tests deterministic.

### 9) Tracing & Observability

* Use the tracing logger; prefer **structured logs** over ad-hoc strings.

### 10) Performance & Safety

* Avoid unbounded arrays in `ctx.messages`; use `conversationBuffer` where appropriate.
* Don’t block the event loop; prefer async I/O and streaming.
* Cap external fetch sizes; time out I/O using `AbortSignal`.

### 11) Repository Structure & Architecture

**Packages Overview:**
- **`@sisu-ai/core`** - Core framework, types, context management
- **`@sisu-ai/adapter-*`** - LLM provider adapters (openai, anthropic, ollama)
- **`@sisu-ai/mw-*`** - Middleware packages
- **`@sisu-ai/tool-*`** - Pre-built tools
- **`@sisu-ai/vector-*`** - Vector storage and retrieval
- **`@sisu-ai/server`** - HTTP server implementation


### 13) Environment Variables & Configuration

**Required for Examples:**
```bash
# OpenAI
API_KEY=sk-...

# Anthropic
API_KEY=sk-ant-...

# Optional
LOG_LEVEL=info          # debug, info, warn, error
TRACE_HTML=1           # Generate HTML traces
```