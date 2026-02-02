# AGENTS Guidelines for This Repository

## Project Overview
**Sisu** is a TypeScript framework for building reliable AI agents with full transparency and control. This monorepo contains:
- **Core**: The main framework engine and types
- **Adapters**: Provider integrations (OpenAI, Anthropic, Ollama)
- **Middleware**: Composable functionality (tracing, tool-calling, error handling, etc.)
- **Tools**: Pre-built tools for common tasks (web search, file operations, etc.)
- **Vector**: Vector storage and retrieval capabilities
- **Server**: HTTP server implementation
- **Examples**: 25+ working examples demonstrating features

## Dev Environment Setup
- This monorepo uses **pnpm@9** and **Turbo@2** for fast, efficient builds and dependency management.
- **Node.js**: Requires >= 18.17 (specified in engines)
- **Package Manager**: Uses pnpm@9.0.0 (see packageManager field)

### Initial Setup
```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm@9

# Install all workspace dependencies
pnpm install

# Build all packages (required before running examples)
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

## Speckit Development Workflow

This project uses **Speckit** for structured development with quality gates defined in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

### For AI Agents Working on Sisu

When implementing new features, follow this workflow:

1. **Start with specification**: Use `/speckit.spec` to define user scenarios with independent testability
2. **Generate implementation plan**: Use `/speckit.plan` for technical design with constitution compliance check  
3. **Create task breakdown**: Use `/speckit.tasks` for granular, testable tasks following TDD requirements
4. **Follow constitution**: All code must meet the 5 core principles (see constitution file)
5. **Maintain quality gates**: ≥80% test coverage, composable design, provider-agnostic interfaces

### Constitution Compliance (Non-Negotiable)

- **Principle I**: Transparency - Full observability with HTML trace generation
- **Principle II**: Composability - Small, focused packages with middleware patterns  
- **Principle III**: Test-First - ≥80% coverage, TDD cycle required
- **Principle IV**: Type Safety - Strict TypeScript, provider-agnostic design
- **Principle V**: Production Ready - Error boundaries, secret redaction, cancellation support

### Quality Gates Checklist

**Pre-Implementation:**
- [ ] Constitution compliance verified
- [ ] User scenarios defined with independent testability  
- [ ] Technical design approved for composability

**Pre-Release:**
- [ ] Tests passing with ≥80% coverage
- [ ] Integration tests completed
- [ ] Documentation updated with examples
- [ ] Changeset created for version management

## Running Examples
The repository includes 25+ examples demonstrating different capabilities. All examples support tracing:

### Quick Example Commands
```bash
# Basic examples
pnpm ex:openai:hello        # Simple hello world
pnpm ex:anthropic:hello     # Anthropic version
pnpm ex:ollama:hello        # Local Ollama version

# Advanced features
pnpm ex:openai:reasoning    # O1 reasoning models
pnpm ex:openai:react        # ReAct pattern
pnpm ex:openai:control      # Control flow
pnpm ex:openai:guardrails   # Safety guardrails
pnpm ex:openai:vision       # Image understanding

# Tool usage
pnpm ex:openai:weather      # Weather tool
pnpm ex:openai:web-search   # Web search
pnpm ex:openai:terminal     # Terminal commands
pnpm ex:openai:github-projects  # GitHub integration

# Streaming and real-time
pnpm ex:openai:stream       # Streaming responses
pnpm ex:openai:server       # HTTP server
```

All examples generate HTML trace files in `./trace-*.html` for debugging.

## Testing Instructions
- **Test Framework**: Vitest with ≥80% coverage target
- **CI/CD**: GitHub Actions (see `.github/workflows/`)
- **Commands**:
  - `pnpm test` - Run all tests
  - `pnpm test:coverage` - Run with coverage report
  - `pnpm test:watch` - Run in watch mode
  - `pnpm vitest run -t "<test name>"` - Run specific test
- **Coverage**: Reports available in `./coverage/` directory
- **Always**: Add/update tests for any code changes, build and test before commits

## Code Guidelines (TypeScript)

**Always keep runnable code**. Always build and test the code base when changes has been make.
**Never edit dist/ files**. Work on the source code, build the dist/.

**Philosophy:** small, explicit, composable. Favor simple, testable building blocks (middleware, tools, adapters) over monoliths.

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
* Validate protocol with invariants middleware (tool\_calls ↔ tool replies) in development.

### 8) Tests

* **Vitest** with target **≥ 80%** coverage.
* Unit tests for:

  * happy path,
  * invalid schema inputs,
  * cancellation via `AbortSignal`,
  * edge cases (empty messages, provider quirks).
* Mock external I/O; keep tests deterministic.

### 9) Tracing & Observability

* Use the tracing logger; prefer **structured logs** over ad-hoc strings.
* For examples and demos, write trace files (`run.json`/`run.html`) to aid debugging.

### 10) Performance & Safety

* Avoid unbounded arrays in `ctx.messages`; use `conversationBuffer` where appropriate.
* Don’t block the event loop; prefer async I/O and streaming.
* Cap external fetch sizes; time out I/O using `AbortSignal`.

### 11) Repository Structure & Architecture

**Packages Overview:**
- **`@sisu-ai/core`** - Core framework, types, context management
- **`@sisu-ai/adapter-*`** - LLM provider adapters (openai, anthropic, ollama)
- **`@sisu-ai/mw-*`** - Middleware packages (20+ available)
- **`@sisu-ai/tool-*`** - Pre-built tools (12+ available)
- **`@sisu-ai/vector-*`** - Vector storage and retrieval
- **`@sisu-ai/server`** - HTTP server implementation

**Key Middleware:**
- `mw-trace-viewer` - HTML trace generation
- `mw-tool-calling` - Function calling support
- `mw-error-boundary` - Error handling
- `mw-conversation-buffer` - Message management
- `mw-guardrails` - Safety constraints
- `mw-rag` - Retrieval augmented generation
- `mw-control-flow` - Branching and routing

**Available Tools:**
- Web: `web-search-*`, `web-fetch`, `extract-urls`
- Storage: `aws-s3`, `azure-blob`, `vec-chroma`
- Dev: `terminal`, `github-projects`
- Text: `summarize-text`, `wikipedia`

### 12) Release Management & PR Guidelines

**Changeset Workflow:**
```bash
pnpm changeset          # Create changeset
pnpm version-packages   # Bump versions
pnpm release            # Publish packages
```

**Release Commands:**
- `pnpm release:plan` - Preview upcoming releases
- `pnpm release:report` - Generate release report
- `pnpm check-changes-since-publish` - Check for unpublished changes

**PR Checklist:**
- [ ] API surface is minimal and documented
- [ ] Types precise; zero `any`
- [ ] Tests added/updated; coverage ≥80%
- [ ] Changeset created (`pnpm changeset`)
- [ ] Examples updated if public API changed
- [ ] No secrets or API keys in logs
- [ ] Build passes (`pnpm build`)
- [ ] All tests pass (`pnpm test`)

### 13) Environment Variables & Configuration

**Required for Examples:**
```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Optional
LOG_LEVEL=info          # debug, info, warn, error
TRACE_HTML=1           # Generate HTML traces
```

**Development:**
```bash
NODE_ENV=development    # Enable debug features
```
