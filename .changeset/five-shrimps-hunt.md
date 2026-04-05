---
"@sisu-ai/core": minor
"@sisu-ai/server": patch
---

Add a new reusable embeddings client factory to `@sisu-ai/core` and export it from the public API.

This gives adapter and integration authors a standard way to build OpenAI-compatible embeddings clients with configurable auth, request shape, and response parsing.

Apply a non-breaking `@sisu-ai/server` patch that cleans up route matcher export wiring and import paths without changing runtime behavior.
