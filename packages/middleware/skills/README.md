# @sisu-ai/mw-skills

Filesystem-based skills middleware for SISU. Skills are `SKILL.md` files with YAML frontmatter plus optional resources.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-skills)](https://www.npmjs.com/package/@sisu-ai/mw-skills)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup

```bash
npm i @sisu-ai/mw-skills
```

## What It Does

- Discovers skills from explicitly configured directories (no implicit defaults).
- Registers a `use_skill` tool that loads full skill instructions on demand.
- Injects skill metadata into the system prompt to enable LLM-native matching.

## Usage

```ts
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const app = new Agent().use(
  skillsMiddleware({ directories: [".sisu/skills"] }),
);
```

### Tool alias compatibility

Many ecosystem skills expect snake_case tool names like `read_file`. Use tool aliases to match.

```ts
registerTools(terminal.tools, {
  aliases: {
    terminalRun: "bash",
    terminalReadFile: "read_file",
    terminalCd: "cd",
  },
});
```

## Configuration

```ts
interface SkillsOptions {
  /** Required: directories to scan for skills */
  directories?: string[];

  /** Optional single-directory shorthand */
  directory?: string;

  /** Base path for resolving relative directories (default: process.cwd()) */
  cwd?: string;

  /** Max file size for resources (bytes, default: 100KB) */
  maxFileSize?: number;

  /** Max total size per skill (bytes, default: 500KB) */
  maxSkillSize?: number;

  /** Cache TTL in ms (default: 5 minutes) */
  cacheTtl?: number;

  /** Include only specific skill names */
  include?: string[];

  /** Exclude specific skill names */
  exclude?: string[];
}
```

## Progressive Disclosure

Skills are loaded in three levels to reduce prompt size:

1. **Metadata** (name + description) in the system prompt
2. **Instructions** loaded when `use_skill` is called
3. **Resources** loaded on demand (read via tools)

## Examples

- `examples/openai-skills`
- `examples/anthropic-skills`

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
