# @sisu-ai/server

## 4.0.1

### Patch Changes

- Updated dependencies [bacf245]
  - @sisu-ai/core@2.0.1

## 4.0.0

### Patch Changes

- Updated dependencies [de89201]
  - @sisu-ai/core@2.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 2.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 2.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 2.0.1

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

## 2.0.0

### Patch Changes

- b2675b7: docs: Update README files to include badges and community support sections
- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 1.0.0

### Major Changes

- 730e24b: Introduces a new HTTP middleware, `@sisu-ai/mw-agent-run-api`, which provides standardized API endpoints for starting, monitoring, streaming, and cancelling Sisu agent runs. It also adds a complete example project (`examples/openai-server`) demonstrating how to run Sisu over HTTP using the OpenAI adapter, server adapter, and the new middleware. Additionally, it includes minor improvements to the OpenAI adapter's streaming logic and updates to the main repo scripts.

  **Key changes:**

  ### New Middleware: Agent Run API
  - Introduced `@sisu-ai/mw-agent-run-api`, a middleware package that exposes HTTP endpoints for agent run management (start, status, stream, cancel), with support for custom start routes, API key auth, and SSE streaming. Includes documentation and package metadata.

  ### Example Project: OpenAI Server
  - Added `examples/openai-server`, a full example of running Sisu over HTTP with the OpenAI adapter and the new agent run API middleware. Includes `README.md`, `CHANGELOG.md`, `package.json`, `tsconfig.json`, and a TypeScript entrypoint.

  ### OpenAI Adapter Improvements
  - Improved OpenAI streaming: gracefully ignores `[DONE]` sentinels and only logs JSON parse errors in debug mode, making streaming more robust and less noisy.

  ### Tooling and Scripts
  - Added a new npm script `ex:openai:server` to easily run the OpenAI server example from the monorepo root.

  ### Miscellaneous
  - Minor: Hardcoded model name in the Anthropic control flow example for clarity.
  - Updated changeset to document new server adapter and API entrypoints middleware.
