# @sisu-ai/runtime-desktop

## 0.2.4

### Patch Changes

- Updated dependencies [2e43e02]
  - @sisu-ai/core@2.6.1
  - @sisu-ai/adapter-anthropic@10.0.0
  - @sisu-ai/adapter-ollama@12.0.0
  - @sisu-ai/adapter-openai@12.0.0

## 0.2.3

### Patch Changes

- 3f417c7: Adopt the new middleware-first execution flow across core and generated app scaffolds.

  Core now standardizes execution around `execute` and `executeStream` middleware patterns, including configurable streaming sink usage through `executeStream(opts)` and consistent typed execution results/events in context state.

  `@sisu-ai/mw-tool-calling` remains available as legacy compatibility middleware, now explicitly documented as a migration path to core execution middleware.

  CLI templates and installer guidance now scaffold the core execution approach by default so new projects follow the recommended runtime pattern out of the box.

- Updated dependencies [3f417c7]
  - @sisu-ai/core@2.6.0
  - @sisu-ai/adapter-anthropic@10.0.0
  - @sisu-ai/adapter-ollama@12.0.0
  - @sisu-ai/adapter-openai@12.0.0
  - @sisu-ai/mw-error-boundary@12.0.0
  - @sisu-ai/mw-guardrails@12.0.0
  - @sisu-ai/mw-invariants@12.0.0

## 0.2.2

### Patch Changes

- Updated dependencies [aa659d9]
- Updated dependencies [3e8c117]
  - @sisu-ai/core@2.5.0
  - @sisu-ai/adapter-openai@11.0.0
  - @sisu-ai/adapter-anthropic@9.0.0
  - @sisu-ai/adapter-ollama@11.0.0
  - @sisu-ai/mw-error-boundary@11.0.0
  - @sisu-ai/mw-guardrails@11.0.0
  - @sisu-ai/mw-invariants@11.0.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @sisu-ai/adapter-openai@10.0.2
  - @sisu-ai/adapter-anthropic@8.1.2
  - @sisu-ai/adapter-ollama@10.0.2

## 0.2.0

### Minor Changes

- Improve the interactive chat experience with markdown-aware output rendering, richer session management flows, and new Ink-first interaction shortcuts and menus.

  Interactive mode now uses the default `sisu chat` flow directly, with improved terminal rendering and session controls for day-to-day usage.

  Introduce new publishable packages for local runtime workflows:
  - `@sisu-ai/protocol` for shared runtime protocol contracts.
  - `@sisu-ai/runtime-desktop` for a desktop-first local Sisu runtime and CLI entrypoint.

### Patch Changes

- Updated dependencies
  - @sisu-ai/protocol@0.2.0
