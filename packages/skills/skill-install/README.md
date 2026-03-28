# `@sisu-ai/skill-install`

Install the `sisu-framework` skill into supported agent environments from a single CLI.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fskill-install)](https://www.npmjs.com/package/@sisu-ai/skill-install)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Usage

```bash
npx @sisu-ai/skill-install
```

After global install, you can also run:

```bash
sisu-skill-install
```

Interactive targets include:

- Claude Code / Claude Desktop
- Cline
- Roo Code
- Windsurf
- Kilo Code
- Codex CLI
- GitHub Copilot

## Flags

```bash
npx @sisu-ai/skill-install --target codex --scope workspace --yes
npx @sisu-ai/skill-install --target copilot --dir /path/to/project --scope custom --yes
npx @sisu-ai/skill-install --list
```

## What It Installs

- Native skill platforms receive a copied `sisu-framework` skill directory.
- Codex installs the skill under `.sisu/skills/sisu-framework` and adds a managed section to `AGENTS.md`.
- Copilot installs the skill under `.sisu/skills/sisu-framework` and adds a managed section to `.github/copilot-instructions.md`.

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
