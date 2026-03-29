## Why

Sisu now has first-class OpenAI embeddings support, but embeddings are still modeled as an adapter-specific concern even when the request shape is already generic enough to work across multiple providers. This change is needed now to unblock Anthropic users from RAG workflows, reduce duplicated provider logic, and establish a stable core embeddings entry point that adapters can reuse.

## Goals

- Move the generic embeddings HTTP client and typed contract into `@sisu-ai/core`.
- Keep provider ergonomics by exposing adapter helpers such as `openAIEmbeddings`, `anthropicEmbeddings`, and `ollamaEmbeddings`.
- Support OpenAI-compatible embeddings endpoints through the core client, with provider helpers supplying defaults and environment conventions.
- Add Ollama-specific support for `/api/embed` so local-first RAG flows have a first-class path.
- Preserve explicit configuration and predictable error/cancellation behavior for tools and middleware that consume embeddings.

## Non-goals

- Add a Voyage-specific integration in this change.
- Redesign RAG middleware, vector stores, or retrieval semantics.
- Introduce hidden provider auto-detection or fallback routing between embedding vendors.
- Remove adapter helper APIs that users already rely on.

## What Changes

- Add a generic embeddings client to `@sisu-ai/core` with explicit configuration for endpoint, auth, model, and response mapping.
- Refactor `@sisu-ai/adapter-openai` so `openAIEmbeddings(...)` becomes a thin preset over the core embeddings client.
- Add `anthropicEmbeddings(...)` to `@sisu-ai/adapter-anthropic` as a thin preset over the same core client, using an OpenAI-compatible configuration rather than Anthropic-specific HTTP behavior.
- Add `ollamaEmbeddings(...)` to `@sisu-ai/adapter-ollama` with Ollama request/response mapping for `/api/embed`.
- Update public docs and examples so embeddings are documented as a shared capability with adapter convenience wrappers.
- Update tests to cover batch ordering, cancellation, and provider-specific error handling for core and wrapper functions.

## Capabilities

### New Capabilities
- `generic-embeddings-client`: A core, provider-agnostic embeddings client that adapters and application code can configure directly for compatible APIs and custom endpoints.
- `ollama-embeddings-adapter`: An Ollama-specific embeddings helper that conforms to the shared embeddings contract while targeting Ollama's `/api/embed` API.

### Modified Capabilities
- `adapter-embeddings-api`: Expand the normalized embeddings contract so adapter helpers may delegate to a core client, and require Anthropic and OpenAI adapter helpers to expose the same public contract for RAG-style usage.

## Impact

- **Target audience**: application developers composing RAG flows, package maintainers adding provider support, and users migrating between hosted and local embedding backends.
- **User-facing changes**: new core embeddings factory export; new `anthropicEmbeddings(...)` and `ollamaEmbeddings(...)` helper exports; `openAIEmbeddings(...)` remains available but is reimplemented on the shared core path.
- **API surface**: adds new public exports in `@sisu-ai/core`, `@sisu-ai/adapter-anthropic`, and `@sisu-ai/adapter-ollama`; no planned breaking removal.
- **Affected code**: core typed contracts/helpers, adapter packages, tests, READMEs, and embedding-related examples.
- **Dependencies/systems**: no new runtime dependency is required; implementations continue to rely on `fetch` and existing environment-variable configuration patterns.
- **Success metrics / acceptance criteria**: applications can instantiate embeddings from core directly, OpenAI and Anthropic helpers share that implementation path, Ollama embeddings work through the normalized contract, and RAG consumers use all three without provider-specific branching.
