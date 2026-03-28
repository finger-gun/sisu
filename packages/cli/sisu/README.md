# `@sisu-ai/cli`

CLI for discovering Sisu packages and scaffolding maintained starter projects.

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
```

After global install, you can also run:

```bash
sisu list tools
```

## Commands

- `sisu list <category>`
- `sisu info <name>`
- `sisu create <template> <project-name>`
- `sisu install skill [installer-options]`

Categories:

- `libraries`
- `middleware`
- `tools`
- `adapters`
- `vector`
- `skills`
- `templates`

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
