## Why

When developers or agents adopt Sisu in a project, they often invent middleware, tools, or architecture that already exists in the framework.

Sisu has docs and examples, but it lacks a canonical discovery and scaffolding surface that can be queried directly from a terminal.

## Goals

- Add a `sisu` CLI for humans and agents.
- Make package discovery explicit with commands like `list` and `info`.
- Add a small set of maintained starter templates via `create`.
- Keep the CLI metadata-driven and aligned with Sisu package boundaries.

## Non-goals

- Full project generation for every Sisu feature.
- Runtime package introspection from npm registry in this phase.
- Replacing package READMEs or example documentation.

## What Changes

- Add a new package `packages/cli/sisu` that publishes a `sisu` binary.
- Implement `sisu list <category>`, `sisu info <name>`, and `sisu create <template> <project-name>`.
- Ship a curated catalog of maintained Sisu packages and templates.
- Add starter templates for `chat-agent`, `cli-agent`, and `rag-agent`.
- Update docs and skill guidance so agents are told to consult the CLI before inventing framework primitives.

## Capabilities

### New Capabilities

- `cli-package-discovery`: discover maintained Sisu packages and examples from the terminal.
- `cli-template-scaffolding`: scaffold small maintained Sisu project starters.

## Impact

- Affected code:
  - `packages/cli/sisu/*`
  - template assets and related docs
  - `skills/sisu-framework/*`
- API surface:
  - introduces `sisu` CLI
- Risks:
  - catalog can drift if not kept in sync with maintained packages and examples
