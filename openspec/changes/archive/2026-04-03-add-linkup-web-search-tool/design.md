## Context

Sisu tool packages follow a consistent pattern: a single typed tool export, Zod schema validation, deterministic configuration precedence, and focused unit tests. Existing web search tools (`web-search-openai`, `web-search-duckduckgo`) already establish naming and packaging conventions that this LinkUp tool should follow.

This change adds a new package so agent builders can use LinkUp’s search API as a first-class Sisu tool while preserving strict TypeScript guarantees and explicit runtime behavior.

## Goals / Non-Goals

**Goals:**
- Provide a `webSearch` tool powered by LinkUp SDK with validated options.
- Resolve API configuration deterministically from `ctx.deps` and environment variables.
- Return compact serializable output and avoid hidden retries/fallback behavior.
- Fit existing monorepo conventions for docs, tests, and discovery metadata.

**Non-Goals:**
- Adding a dedicated Sisu model adapter for LinkUp.
- Supporting advanced LinkUp authentication modes (x402 signer) in this iteration.
- Changing existing web-search tool contracts outside this new package.

## Decisions

1. **Create a standalone package `packages/tools/web-search-linkup`**
   - Rationale: aligns with monorepo package granularity and discoverability (`@sisu-ai/tool-*`).
   - Alternative: extend an existing web search package with provider switches. Rejected to keep tool behavior explicit and dependency boundaries clean.

2. **Export a single tool named `webSearch`**
   - Rationale: consistent with existing web search tool name so agents/prompts can remain stable.
   - Alternative: `linkupWebSearch` tool name. Rejected because it diverges from current conventions and weakens interchangeability.

3. **Use `linkup-sdk` `LinkupClient.search()` directly**
   - Rationale: avoids custom HTTP handling and keeps parity with provider API changes.
   - Alternative: raw fetch implementation. Rejected due to higher maintenance and greater schema drift risk.

4. **Configuration precedence = `ctx.deps.linkup.apiKey` / `ctx.deps.apiKey` → env**
   - Rationale: mirrors existing dependency-injection-first pattern in Sisu tools.
   - Alternative: env-only configuration. Rejected because it reduces testability and runtime composability.

5. **Supported input surface targets practical core fields**
   - Include: `query`, `depth`, `outputType`, `includeImages`, date range, domain include/exclude, citations/sources flags, `maxResults`, `structuredOutputSchema`.
   - Rationale: captures useful documented SDK capabilities without exposing low-value internals.
   - Alternative: minimal query-only interface. Rejected as too limiting.

6. **No silent degradation on provider errors**
   - Rationale: follow repo guidance for explicit errors; throw descriptive messages on missing key or failed calls.
   - Alternative: empty-array fallbacks. Rejected as misleading.

### Data flow and middleware/tool interactions

- Agent middleware registers `linkupWebSearch` via `registerTools`.
- Provider decides to call `webSearch` with validated arguments.
- Tool handler resolves API key from `ToolContext.deps`/env.
- Handler creates `LinkupClient` and calls `client.search(mappedArgs)`.
- Result is returned as JSON-serializable object/array directly to tool-calling middleware.
- Middleware appends tool result into conversation loop as usual.

### Error handling and cancellation behavior

- Missing API key throws explicit configuration error.
- SDK call failures are rethrown as contextual `Error` with provider message.
- Validation failures are handled by existing Zod schema checks before execution.
- No broad catch-and-silence behavior is introduced.
- The SDK call is awaited in a single shot; explicit AbortSignal wiring is deferred unless SDK exposes signal support in future.

### Integration points and expected public exports

- `packages/tools/web-search-linkup/src/index.ts`
  - `linkupWebSearch` named export
  - `default` export
  - public argument/result TypeScript types
- `packages/tools/web-search-linkup/test/linkup-web-search.test.ts`
- `packages/tools/web-search-linkup/README.md`
- `packages/tools/web-search-linkup/CHANGELOG.md`
- Root docs/discovery references:
  - `README.md`
  - `skills/sisu-framework/TOOLS.md`
  - `packages/discovery/src/generated/catalog.json` (generated)

## Risks / Trade-offs

- **[Risk] Upstream SDK response shape changes** → Mitigation: keep return pass-through and validate only inputs.
- **[Risk] Tool name collisions across web-search tools** → Mitigation: maintain existing convention and let users register one active `webSearch` tool per agent.
- **[Risk] Extra dependency footprint** → Mitigation: isolate in dedicated package so only adopters install it.
- **[Risk] Large result payloads** → Mitigation: expose `maxResults` option and keep defaults modest at tool-call level.
