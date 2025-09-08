# @sisu-ai/mw-trace-viewer

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
