---
"@sisu-ai/core": minor
"@sisu-ai/mw-tool-calling": patch
"@sisu-ai/mw-conversation-buffer": patch
"@sisu-ai/cli": patch
"@sisu-ai/runtime-desktop": patch
---

Adopt the new middleware-first execution flow across core and generated app scaffolds.

Core now standardizes execution around `execute` and `executeStream` middleware patterns, including configurable streaming sink usage through `executeStream(opts)` and consistent typed execution results/events in context state.

`@sisu-ai/mw-tool-calling` remains available as legacy compatibility middleware, now explicitly documented as a migration path to core execution middleware.

CLI templates and installer guidance now scaffold the core execution approach by default so new projects follow the recommended runtime pattern out of the box.
