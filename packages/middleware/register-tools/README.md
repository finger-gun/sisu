# @sisu-ai/mw-register-tools

Register a set of tools at the start of the pipeline.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-register-tools)](https://www.npmjs.com/package/@sisu-ai/mw-register-tools)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-register-tools
```

## Exports
- `registerTools(tools: Tool[])` — calls `ctx.tools.register(tool)` for each item.

## What It Does
- Registers one or more tools into `ctx.tools` for the current run.
- Emits a debug log per tool (name + description) to aid troubleshooting.

Tools become available to middlewares that surface them to providers (e.g., `@sisu-ai/mw-tool-calling`) or to custom loops (ReAct, planners).

## How It Works
- On each request, iterates the provided array and calls `ctx.tools.register(tool)`.
- The default registry is in‑memory per context (`SimpleTools`), so registration is per run.
- If a tool with the same name already exists, the last registration wins (overwrites).

## Usage
```ts
import { registerTools } from '@sisu-ai/mw-register-tools';

const app = new Agent()
  .use(registerTools([myTool]));
```

## Placement & Ordering
- Place early in the stack, before tool‑calling or planner middleware that needs access to tools.
- Safe to combine with logging/tracing; tool registration logs at debug level by default.

## Notes & Gotchas
- Naming: keep tool names simple (lower‑case letters/numbers/._-) and consistent with prompts.
- Schemas: for providers like OpenAI, zod shapes are converted to JSON Schema under the hood; keep them precise for better tool selection.
- Overwrites: registering two tools with the same `name` overwrites the first.
- Scope: registration is per request/context. If you need global tools, construct them once and pass the same instances in each request.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
