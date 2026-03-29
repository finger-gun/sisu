# `@sisu-ai/cli`

CLI for discovering Sisu packages, scaffolding maintained starter projects, and running an interactive automation chat.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fcli)](https://www.npmjs.com/package/@sisu-ai/cli)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Usage

```bash
npx @sisu-ai/cli list tools
npx @sisu-ai/cli info vector-vectra
npx @sisu-ai/cli create chat-agent my-app
npx @sisu-ai/cli install skill
npx @sisu-ai/cli chat
```

After global install, you can also run:

```bash
sisu list tools
sisu chat
```

## Commands

- `sisu list <category>`
- `sisu info <name>`
- `sisu create <template> <project-name>`
- `sisu install skill [installer-options]`
- `sisu chat [--session <session-id>] [--prompt <text>]`
- `sisu --version`
- `sisu --json list <category>`

Categories:

- `libraries`
- `middleware`
- `tools`
- `adapters`
- `vector`
- `skills`
- `templates`

## Chat command

This version introduces a first-class interactive chat mode for daily CLI workflows.

### Core flow

- Start interactive mode: `sisu chat`
- Run one-shot prompt: `sisu chat --prompt "run: git status"`
- Resume a known session: `sisu chat --session <session-id>`

### In-chat commands

- `/help` - show command help
- `/new` - start a brand new chat session
- `/provider [ollama|openai|anthropic|mock]` - set provider (interactive picker if omitted)
- `/model [name]` - set model (interactive picker if omitted)
- `/cancel` - cancel active run/tool execution
- `/sessions` - list persisted sessions
- `/search <query>` - search conversation history
- `/resume <session-id>` - switch to a prior session
- `/branch <message-id>` - create a new branch session from a prior message
- `/exit` - close chat

### Tool safety model

Tool executions are policy-gated before execution:

- **allow**: command runs immediately
- **confirm**: explicit user approval is required
- **deny**: command is blocked with a reason

High-impact commands require confirmation by default. Denied and completed actions are persisted in session records with status and metadata.

### Profiles and configuration

Chat profile resolution uses deterministic precedence:

1. Built-in defaults
2. Global profile: `~/.sisu/chat-profile.json`
3. Project profile: `<project>/.sisu/chat-profile.json` (overrides global)

Example profile:

```json
{
  "name": "default",
  "provider": "ollama",
  "model": "qwen3.5:9b",
  "theme": "auto",
  "storageDir": "/Users/you/.sisu/chat-sessions/my-project",
  "toolPolicy": {
    "mode": "balanced",
    "requireConfirmationForHighImpact": true,
    "allowCommandPrefixes": ["echo", "ls", "git status", "pnpm test"]
  }
}
```

Provider notes:

- `mock`: local fallback with no external API calls.
- `openai`: set `OPENAI_API_KEY` (or `API_KEY`) and choose a valid OpenAI model.
- `anthropic`: set `ANTHROPIC_API_KEY` (or `API_KEY`) and choose a valid Claude model.
- `ollama`: ensure `ollama serve` is running and use a locally available model.

Default provider behavior:

- If no provider is configured, chat auto-detects local Ollama models (`ollama list`) and defaults to `ollama`.
- Preferred Ollama defaults are selected in this order when available: `qwen3.5:9b`, `llama3.1`, `llama4`, `qwen3.5:0.8b`.
- If no local Ollama models are found, chat falls back to `mock`.

### Session persistence

Chat sessions are persisted locally (messages, run state, tool lifecycle records, events). This enables:

- deterministic restart/resume behavior
- session search and retrieval
- branch-from-message lineage workflows

## Templates

- `chat-agent` — minimal conversational starter
- `cli-agent` — single-shot CLI prompt starter
- `rag-agent` — local Vectra-backed RAG starter

## Why This Exists

Sisu already has a lot of maintained middleware, tools, adapters, and examples. This CLI gives humans and agents a direct way to discover them before inventing custom framework code.

It also provides a built-in path to install the `sisu-framework` skill:

```bash
npx @sisu-ai/cli install skill
```

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

<details>
<summary>All skill packages</summary>

- [@sisu-ai/skill-code-review](packages/skills/skill-code-review/README.md)
- [@sisu-ai/skill-debug](packages/skills/skill-debug/README.md)
- [@sisu-ai/skill-deploy](packages/skills/skill-deploy/README.md)
- [@sisu-ai/skill-explain](packages/skills/skill-explain/README.md)
- [@sisu-ai/skill-repo-search](packages/skills/skill-repo-search/README.md)
- [@sisu-ai/skill-test-gen](packages/skills/skill-test-gen/README.md)
- [@sisu-ai/skill-install](packages/skills/skill-install/README.md)
</details>

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
