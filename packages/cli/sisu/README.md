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
- `sisu list-official <middleware|tools|skills>`
- `sisu install <tool|middleware> <name> [--global|--project]`
- `sisu install recipe <rag-recommended|rag-advanced> [--global|--project] [--backend vectra|chroma|custom] [--package <name>]`
- `sisu install-skill <package-or-path> [--global|--project] [--dir <path>] [--official]`
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

- Start interactive mode: `sisu chat` (Ink UI by default in TTY)
- Run one-shot prompt: `sisu chat --prompt "show me git status"` (tools can be called automatically when enabled)
- Pipe prompt from stdin: `echo "hello" | sisu chat`
- Resume a known session: `sisu chat --session <session-id>`
- Startup now uses cached provider/model immediately and runs provider health checks in the background.

Legacy explicit tool triggers still work:

- `run: <command>`
- `!<command>`

### In-chat commands

- `/help` - show command help
- `/new` - start a brand new chat session
- `/provider [ollama|openai|anthropic|mock]` - set provider (interactive picker if omitted)
- `/model [name]` - set model (interactive picker if omitted)
- `/tools`, `/skills`, `/middleware` - list capability state by category
- `/enable <capability-id> [session|project|global]` - enable capability with explicit scope
- `/disable <capability-id> [session|project|global]` - disable capability with explicit scope
- `/official <middleware|tools|skills>` - list official `@sisu-ai/*` capability packages
- `/install <tool|middleware> <name> [project|global]` - install official tool/middleware capability package
- `/install recipe <rag-recommended|rag-advanced> [project|global] [vectra|chroma|custom[:package]]` - run guided bundle installs
- `/middleware setup` - guided middleware toggle/reorder/config flow
- `/allow-command <prefix> [session|project|global]` - persist command allow-list prefix by scope
- `/open-config [project|global]` - open profile config in your `$EDITOR`/`$VISUAL`
- `/cancel` - cancel active run/tool execution
- `/sessions` - list persisted sessions and choose resume/delete action
- `/delete-session <session-id>` - delete a saved session directly
- `/search <query>` - search conversation history
- `/resume <session-id>` - switch to a prior session
- `/branch <message-id>` - create a new branch session from a prior message
- `/exit` - close chat
- `/options` - open interactive options menu
- `/settings` - open interactive settings menu

### Tool safety model

Tool executions are policy-gated before execution:

- **allow**: command runs immediately
- **confirm**: explicit user approval is required
- **deny**: command is blocked with a reason

High-impact commands require confirmation by default. Denied and completed actions are persisted in session records with status and metadata.

### Ink shortcuts and menus

- `Ctrl+O` opens the options menu (new session, switch session, branch, help, exit).
- `Shift+S` opens settings (provider/model/session switching).
- `Shift+Enter` inserts a newline in the input box for multiline messages.
- `Ctrl+J` is supported as a fallback in terminals that don't expose Shift+Enter distinctly.
- Menus support `↑/↓` to navigate, `Enter` to select, and `Esc` to close.
- Assistant output is markdown-aware in terminal rendering (headers/lists/code blocks are formatted for readability).

### Profiles and configuration

Chat profile resolution uses deterministic precedence:

1. Built-in defaults
2. Global profile: `~/.sisu/chat-profile.json`
3. Project profile: `<project>/.sisu/chat-profile.json` (overrides global)
4. Session overrides: in-memory updates from interactive commands

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
  },
  "capabilities": {
    "tools": { "enabled": ["terminal"], "disabled": [] },
    "skills": {
      "enabled": [],
      "disabled": [],
      "directories": ["./.sisu/skills", "~/.sisu/skills"]
    },
    "middleware": {
      "enabled": ["error-boundary", "invariants", "register-tools", "tool-calling", "conversation-buffer", "skills"],
      "disabled": [],
      "pipeline": [
        { "id": "error-boundary", "enabled": true, "config": {} },
        { "id": "invariants", "enabled": true, "config": {} },
        { "id": "register-tools", "enabled": true, "config": {} },
        { "id": "tool-calling", "enabled": true, "config": {} },
        { "id": "conversation-buffer", "enabled": true, "config": {} },
        { "id": "skills", "enabled": true, "config": {} }
      ]
    }
  }
}
```

Capability behavior notes:

- Core middleware (`error-boundary`, `invariants`, `register-tools`, `tool-calling`) is locked and cannot be disabled or reordered past core constraints.
- Skill discovery loads from `./.sisu/skills` and `~/.sisu/skills` with project precedence.
- Unknown capability IDs and conflicting `enabled`/`disabled` entries are rejected at startup with field-level diagnostics.

### Official package discovery and install

Official package listing is now discovery-catalog first (`@sisu-ai/discovery`) for deterministic results. If discovery cannot be loaded, CLI falls back to custom package install paths and surfaces a discovery note.

- List official packages by category:

```bash
sisu list-official tools
sisu list-official middleware
sisu list-official skills
sisu install tool azure-blob --project
sisu install middleware context-compressor --global
sisu install recipe rag-recommended --project
sisu install recipe rag-advanced --project --backend chroma
sisu install recipe rag-advanced --project --backend custom --package @sisu-ai/vector-vectra
```

- Install skills to standard directories:

```bash
sisu install-skill @sisu-ai/skill-debug --project
sisu install-skill @sisu-ai/skill-repo-search --global
sisu install-skill ./path/to/local-skill --dir ~/.sisu/skills
```

- Enforce official namespace policy (`@sisu-ai/*`) during install:

```bash
sisu install-skill @sisu-ai/skill-debug --official
```

For script wrappers (for example `skills.sh`-style installers), use non-interactive flags only:

```bash
sisu install-skill @sisu-ai/skill-debug --project --official
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
npx @sisu-ai/cli install-skill @sisu-ai/skill-debug --project
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
