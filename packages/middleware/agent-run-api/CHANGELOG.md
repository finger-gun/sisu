# @sisu-ai/mw-agent-run-api

## 1.0.0

### Major Changes

- 730e24b: Introduces a new HTTP middleware, `@sisu-ai/mw-agent-run-api`, which provides standardized API endpoints for starting, monitoring, streaming, and cancelling Sisu agent runs. It also adds a complete example project (`examples/openai-server`) demonstrating how to run Sisu over HTTP using the OpenAI adapter, server adapter, and the new middleware. Additionally, it includes minor improvements to the OpenAI adapter's streaming logic and updates to the main repo scripts.

  **Key changes:**

  ### New Middleware: Agent Run API

  - Introduced `@sisu-ai/mw-agent-run-api`, a middleware package that exposes HTTP endpoints for agent run management (start, status, stream, cancel), with support for custom start routes, API key auth, and SSE streaming. Includes documentation and package metadata.

  ### OpenAI Adapter Improvements

  - Improved OpenAI streaming: gracefully ignores `[DONE]` sentinels and only logs JSON parse errors in debug mode, making streaming more robust and less noisy.

### Patch Changes

- Updated dependencies [730e24b]
  - @sisu-ai/server@1.0.0
