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

- `registerTools(tools: Tool[], options?: RegisterToolsOptions)` — calls `ctx.tools.register(tool)` for each item and optionally configures tool aliases.

## What It Does

- Registers one or more tools into `ctx.tools` for the current run.
- Optionally configures tool aliases for ecosystem compatibility.
- Emits a debug log per tool (name + description) to aid troubleshooting.

Tools become available to middlewares that surface them to providers (e.g., `@sisu-ai/mw-tool-calling`) or to custom loops (ReAct, planners).

## How It Works

- On each request, iterates the provided array and calls `ctx.tools.register(tool)`.
- The default registry is in‑memory per context (`SimpleTools`), so registration is per run.
- If a tool with the same name already exists, the last registration wins (overwrites).

## Usage

### Basic Registration

```ts
import { registerTools } from "@sisu-ai/mw-register-tools";

const app = new Agent().use(registerTools([myTool]));
```

### Tool Aliases for Ecosystem Compatibility

You can register tools with aliases to make them compatible with ecosystem-standard tool names. This is useful when integrating with skills or frameworks that expect specific tool names (e.g., Cline skills, MCP tools).

```ts
import { registerTools } from "@sisu-ai/mw-register-tools";
import { createTerminalTool } from "@sisu-ai/tool-terminal";

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
});

const app = new Agent().use(
  registerTools(terminal.tools, {
    aliases: {
      terminalRun: "bash",
      terminalReadFile: "read_file",
      terminalCd: "cd",
    },
  }),
);
```

**How It Works:**

1. Tools are registered in `ctx.tools` with their canonical SISU names (e.g., `terminalRun`)
2. Alias mappings are stored in `ctx.state.toolAliases`
3. The `tool-calling` middleware renames tools before sending to the LLM API (e.g., model sees `bash`)
4. When the model calls a tool using an alias, SISU resolves it back to the canonical name
5. Tool handlers execute using the original canonical name from the registry

**When to Use Aliases:**

- ✅ Integrating with skills that expect specific tool names (e.g., Cline skills)
- ✅ Following ecosystem conventions (e.g., `bash`, `read_file`, `write_file`)
- ✅ Making tools compatible with external agent frameworks
- ❌ Default use cases (SISU names work fine without aliases)

**Important Notes:**

- Aliases are completely optional - tools work without them
- Aliases are only used for API communication; internally, canonical names are always used
- You can partially alias tools (some aliased, some not)
- Invalid aliases (referencing non-existent tools) generate warnings but don't fail

## Placement & Ordering

- Place early in the stack, before tool‑calling or planner middleware that needs access to tools.
- Safe to combine with logging/tracing; tool registration logs at debug level by default.

## Notes & Gotchas

- Naming: keep tool names simple (lower‑case letters/numbers/.\_-) and consistent with prompts.
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
