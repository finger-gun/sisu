# sisu

## 0.6.0

### Minor Changes

- 3e8c117: Add catalog-driven capability discovery and installation to the CLI, including improved interactive chat capabilities and configuration flows.

  Publish the new `@sisu-ai/discovery` and `@sisu-ai/tool-web-search-linkup` packages for dynamic package discovery and LinkUp web search support.

  Patch provider adapters and DuckDuckGo web search handling for improved runtime compatibility and safer error handling.

### Patch Changes

- Updated dependencies [aa659d9]
- Updated dependencies [3e8c117]
  - @sisu-ai/core@2.5.0
  - @sisu-ai/discovery@0.2.0
  - @sisu-ai/adapter-openai@11.0.0
  - @sisu-ai/adapter-anthropic@9.0.0
  - @sisu-ai/adapter-ollama@11.0.0
  - @sisu-ai/mw-skills@2.0.0
  - @sisu-ai/mw-trace-viewer@12.0.0
  - @sisu-ai/tool-terminal@9.0.0

## 0.5.1

### Patch Changes

- Fix a startup crash in global/`npx` CLI installs caused by adapter imports expecting a newer `@sisu-ai/core` embedding export.

  Adapters now resolve `createEmbeddingsClient` compatibly at runtime and fall back to an internal embeddings client implementation when needed, preventing ESM import-time failures with older published core artifacts.

  CLI gets a patch bump so published dependency versions pull in the fixed adapter releases.

- Updated dependencies
  - @sisu-ai/adapter-openai@10.0.2
  - @sisu-ai/adapter-anthropic@8.1.2
  - @sisu-ai/adapter-ollama@10.0.2

## 0.5.0

### Minor Changes

- Improve the interactive chat experience with markdown-aware output rendering, richer session management flows, and new Ink-first interaction shortcuts and menus.

  Interactive mode now uses the default `sisu chat` flow directly, with improved terminal rendering and session controls for day-to-day usage.

  Introduce new publishable packages for local runtime workflows:
  - `@sisu-ai/protocol` for shared runtime protocol contracts.
  - `@sisu-ai/runtime-desktop` for a desktop-first local Sisu runtime and CLI entrypoint.

## 0.4.0

### Minor Changes

- 40a291f: Rename the publishable CLI package names to scoped npm packages.
  - `sisu` becomes `@sisu-ai/cli`
  - `sisu-skill-install` becomes `@sisu-ai/skill-install`

  The executable names stay the same:
  - `sisu`
  - `sisu-skill-install`

### Patch Changes

- Updated dependencies [40a291f]
  - @sisu-ai/skill-install@0.4.0

## 0.3.0

### Minor Changes

- 40a291f: Rename the publishable CLI package names to scoped npm packages.
  - `sisu` becomes `@sisu-ai/cli`
  - `sisu-skill-install` becomes `@sisu-ai/skill-install`

  The executable names stay the same:
  - `sisu`
  - `sisu-skill-install`

### Patch Changes

- Updated dependencies [40a291f]
  - @sisu-ai/skill-install@0.3.0

## 0.2.0

### Minor Changes

- 80badd8: Add the `sisu` CLI for discovery and starter scaffolding.

  The MVP supports `list`, `info`, and `create` commands, plus starter templates for chat, CLI, and local Vectra-backed RAG agents.

### Patch Changes

- Updated dependencies [80badd8]
  - sisu-skill-install@0.2.0
