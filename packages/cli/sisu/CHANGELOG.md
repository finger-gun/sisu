# sisu

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
