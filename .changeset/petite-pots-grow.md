---
"@sisu-ai/mw-agent-run-api": major
"@sisu-ai/mw-cors": major
"@sisu-ai/server": major
---

Introduces a new HTTP middleware, `@sisu-ai/mw-agent-run-api`, which provides standardized API endpoints for starting, monitoring, streaming, and cancelling Sisu agent runs. It also adds a complete example project (`examples/openai-server`) demonstrating how to run Sisu over HTTP using the OpenAI adapter, server adapter, and the new middleware. Additionally, it includes minor improvements to the OpenAI adapter's streaming logic and updates to the main repo scripts.

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

