## Overview

The `sisu` CLI is a metadata-driven terminal entrypoint for discovering Sisu capabilities and generating small starter projects.

The CLI is intentionally simple:

- curated catalog rather than runtime repo scanning
- explicit commands rather than wizard-heavy flows
- maintained starter templates rather than generated code

## Package Shape

- Package: `packages/cli/sisu`
- Binary: `sisu`
- Public commands in MVP:
  - `sisu list <category>`
  - `sisu info <name>`
  - `sisu create <template> <project-name>`

## Catalog

The CLI ships with a curated catalog covering:

- middleware
- tools
- adapters
- vector packages
- skills
- templates

Each entry includes:

- package or template identifier
- short summary
- docs path
- related examples
- aliases/tags for lookup

This avoids guessing and provides a stable discovery surface for both humans and agents.

## Templates

Templates are stored as package assets and copied into the destination directory.

MVP templates:

- `chat-agent`
- `cli-agent`
- `rag-agent`

Templates use published package names and minimal defaults so they can run outside the monorepo.

## Agent Guidance

The Sisu framework skill should instruct agents to consult `sisu list` / `sisu info` before proposing new middleware or tools. That turns package discovery into a repeatable workflow instead of a prompt-only convention.
