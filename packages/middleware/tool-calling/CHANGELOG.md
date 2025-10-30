# @sisu-ai/mw-tool-calling

## 6.0.0

### Major Changes

- de89201: Implement tool handler sandboxing with restricted ToolContext

  **Security Enhancement:**
  Tool handlers now receive a sandboxed `ToolContext` instead of full `Ctx`, preventing:
  - Tools from calling other tools (no `tools` registry access)
  - Tools from manipulating conversation history (no `messages` access)
  - Tools from accessing middleware state (no `state` access)
  - Tools from interfering with user I/O (no `input`/`stream` access)

  **New Types:**
  - `ToolContext` interface with restricted properties: `memory`, `signal`, `log`, `model`, `deps`
  - `Tool` interface updated to use `ToolContext` in handler signature

  **Breaking Changes:**
  - Tool handlers must now accept `ToolContext` instead of `Ctx`
  - Custom tools need to update their handler signatures
  - AWS S3 tool now uses `ctx.deps` for dependency injection instead of `ctx.state`

  **Dependency Injection:**
  - New `deps` property in `ToolContext` for proper dependency injection
  - Middleware can provide dependencies via `ctx.state.toolDeps`
  - Tools access dependencies via `ctx.deps?.dependencyName`

  **Migration Guide:**

  ```typescript
  // Before
  const myTool: Tool = {
    handler: async (args, ctx: Ctx) => {
      // had access to full context
    },
  };

  // After
  const myTool: Tool = {
    handler: async (args, ctx: ToolContext) => {
      // restricted context with memory, signal, log, model, deps
    },
  };
  ```

### Patch Changes

- Updated dependencies [de89201]
  - @sisu-ai/core@2.0.0

## 5.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 4.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 4.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 4.0.1

### Patch Changes

- 82e8b95: Add CodeQL badges to documentation for enhanced security scanning
  - Added CodeQL badge to the main README.md for visibility.
  - Included CodeQL badge in the README.md files of various packages:
    - adapters: anthropic, ollama, openai
    - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
    - server
    - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
    - vector: core
- Updated dependencies [82e8b95]
  - @sisu-ai/core@1.1.1

## 4.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 3.0.3

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections

## 3.0.2

### Patch Changes

- 2b3af8b: Documentation updates
- Updated dependencies [2b3af8b]
  - @sisu-ai/core@1.0.2

## 3.0.1

### Patch Changes

- 94c8fd1: Add keywords to package metadata.
- Updated dependencies [94c8fd1]
  - @sisu-ai/core@1.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [8a5a90e]
  - @sisu-ai/core@1.0.0

## 2.0.0

### Minor Changes

- c598ef8: Highlights
  - New tools: `@sisu-ai/tool-wikipedia`, `@sisu-ai/tool-web-fetch`, revamped `@sisu-ai/tool-web-search-openai`, and enhanced `@sisu-ai/tool-web-search-duckduckgo`.
  - CLI flags everywhere: adapters and tools now honor kebab‑case CLI flags with precedence CLI > env (adapter options in code still win).
  - Better examples: added `openai-wikipedia`, `openai-web-fetch`, and `openai-search-fetch` (search → fetch → summarize) and refreshed all example READMEs and commands.
  - Quality: stronger diagnostics, safer HTML stripping, optional DDG fallback, and comprehensive tests. Coverage > 80%.

  Core
  - Add `parseFlags(argv)` and `firstConfigValue([ENV...])` in `@sisu-ai/core` to standardize CLI flag handling.
  - Adapters/tools consume flags automatically (no per‑example parsing needed).
  - Docs: core README simplified; examples are documented in their folders.

  Adapters
  - OpenAI: accept `OPENAI_API_KEY` or generic `API_KEY`; support CLI flags for base URL and key; optional `responseModel` hint exposed via `model.meta`.
  - Ollama: reads base URL via the new core helpers; docs mention CLI overrides.

  Tools
  - Wikipedia (`@sisu-ai/tool-wikipedia`): fetch `summary`, `html`, or `related` via REST API. Language/base override via `WIKIPEDIA_LANG`/`WIKIPEDIA_BASE_URL`.
  - Web Fetch (`@sisu-ai/tool-web-fetch`): fetch a URL and return text/html/json with size cap, basic HTML→text extraction, title detection, user‑agent + max‑bytes envs. Hardened regex to strip scripts/styles and comments.
  - OpenAI Web Search: targets Responses API `web_search`; env/flag support for `OPENAI_RESPONSES_BASE_URL`/model; non‑JSON guard; clearer errors; retry on model mismatch; model precedence (CLI/env → adapter meta → adapter name → default).
  - DuckDuckGo Web Search: adds `topK` and `region`, DEBUG logs, non‑JSON guard; optional HTML SERP fallback (`DDG_HTML_FALLBACK=1`) and meta output (`DDG_RETURN_META=1`) for debugging empty results; better typing and URL/icon normalization.

  Examples
  - New: `examples/openai-wikipedia`, `examples/openai-web-fetch`, `examples/openai-search-fetch`.
  - All example READMEs updated: correct root scripts and full command alternatives; config flags documented.
  - Existing examples simplified to rely on adapter/tool CLI support.

  Middleware docs
  - Control‑flow README expanded with concepts and code for `branch`, `switchCase`, `loopUntil/loopWhile`, and `graph`.
  - ReAct parser README explains Think→Act→Observe→Reflect, expected action format, prompting tips.

  Repo structure & coverage
  - Move tools to `packages/tools/*` (package names unchanged). Updated references and lockfile.
  - Coverage config excludes tests and trivial barrels; overall coverage now > 80%.

### Patch Changes

- Updated dependencies [c598ef8]
  - @sisu-ai/core@0.3.0

## 1.0.1

### Patch Changes

- ac29bf1: Updated documentation
- Updated dependencies [ac29bf1]
  - @sisu-ai/core@0.2.1

## 1.0.0

### Minor Changes

- 4050f86: First release

### Patch Changes

- Updated dependencies [4050f86]
  - @sisu-ai/core@0.2.0
