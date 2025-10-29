# @sisu-ai/mw-trace-viewer

## 5.0.7

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 5.0.6

### Patch Changes

- 918efd9: Fix `html` and `json` options to work correctly when passed to `traceViewer()`. Previously, these options were ignored and environment variables (`TRACE_HTML=1`, `TRACE_JSON=1`) were required to control output. Now:
  - `opts.html` and `opts.json` take precedence when explicitly set
  - Environment variables serve as defaults when options are not provided
  - Backward compatibility maintained: both HTML and JSON written by default

## 5.0.5

### Patch Changes

- 67529e8: Fix missing assets directory in published package. The `assets/` directory containing viewer.html, viewer.css, and viewer.js files is now included in the npm package, resolving the ENOENT error when HTML trace output is enabled.

## 5.0.3

### Patch Changes

- 1128ef4: Fix ES module compatibility by removing \_\_dirname usage

  This fixes the issue where traceViewer middleware was incompatible with ES modules due to its reliance on `__dirname`, which is not available in ES module scope.

  **Changes:**
  - Replaced all `__dirname` references with `import.meta.url` and `fileURLToPath` for ES module-compatible path resolution
  - Added `fileURLToPath` import from `node:url`
  - Updated asset resolution logic in `writeIndexAssets` function to use ES module path resolution
  - Maintained backward compatibility with proper fallback for monorepo structure

  **Impact:**
  - traceViewer middleware now works seamlessly in projects using ES modules (type: "module")
  - No breaking changes - existing CommonJS projects continue to work
  - Fixes runtime errors when using the middleware in ES module projects

  Resolves the bug where projects with `"type": "module"` in package.json could not use the traceViewer middleware.

## 5.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 5.0.1

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

## 5.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 4.1.1

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections

## 4.1.0

### Minor Changes

- 3e576fd: Adds logs support from server

## 4.0.0

### Major Changes

- f073d08: A new, more efficient way for the trace viewer to display and load trace runs by generating a lightweight index (`SISU_RUN_INDEX`) in `runs.js`. This enables the viewer to quickly render a summary list of runs and only load full run details on demand, improving performance for directories with many traces. The changes also update the viewer logic and tests to support and verify this new index-based approach.

  Key changes:

  **Trace viewer asset generation and index creation:**
  - The `writeIndexAssets` function in `src/index.ts` now generates a lightweight index of runs (`SISU_RUN_INDEX`) in `runs.js`, summarizing each trace run with id, file, title, time, status, and duration, preferring `.js` files for loading to avoid CORS issues.

  **Viewer UI and loading logic:**
  - `viewer.js` is updated to use the new `SISU_RUN_INDEX` for rendering the run list and lazy-loading detailed run data only when a run is selected, falling back to the old behavior if the index is not present. This includes new helper functions like `ensureRunLoaded` and updates to filtering and selection logic.

  **Testing improvements:**
  - Tests in `trace-viewer.test.ts` are updated to verify that `runs.js` is created with a valid lightweight index and that the index contains the expected summary fields for each run, both for standard and html-only outputs.

## 3.1.0

### Minor Changes

- bdb3dbf: New UI/UX

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
