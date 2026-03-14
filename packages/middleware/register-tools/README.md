# @sisu-ai/mw-register-tools

Register tool sets once and make them consistently available across your middleware pipeline.

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

---

## Documentation

**Core** — [Package docs](packages/core/README.md) · [Error types](packages/core/ERROR_TYPES.md)

**Adapters** — [OpenAI](packages/adapters/openai/README.md) · [Anthropic](packages/adapters/anthropic/README.md) · [Ollama](packages/adapters/ollama/README.md)

<details>
<summary>All middleware packages</summary>

- [@sisu-ai/mw-agent-run-api](packages/middleware/agent-run-api/README.md)
- [@sisu-ai/mw-context-compressor](packages/middleware/context-compressor/README.md)
- [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md)
- [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md)
- [@sisu-ai/mw-cors](packages/middleware/cors/README.md)
- [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md)
- [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md)
- [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md)
- [@sisu-ai/mw-orchestration](packages/middleware/orchestration/README.md)
- [@sisu-ai/mw-rag](packages/middleware/rag/README.md)
- [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md)
- [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md)
- [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md)
- [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md)
- [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md)
</details>

<details>
<summary>All tool packages</summary>

- [@sisu-ai/tool-aws-s3](packages/tools/aws-s3/README.md)
- [@sisu-ai/tool-azure-blob](packages/tools/azure-blob/README.md)
- [@sisu-ai/tool-extract-urls](packages/tools/extract-urls/README.md)
- [@sisu-ai/tool-github-projects](packages/tools/github-projects/README.md)
- [@sisu-ai/tool-summarize-text](packages/tools/summarize-text/README.md)
- [@sisu-ai/tool-terminal](packages/tools/terminal/README.md)
- [@sisu-ai/tool-vec-chroma](packages/tools/vec-chroma/README.md)
- [@sisu-ai/tool-web-fetch](packages/tools/web-fetch/README.md)
- [@sisu-ai/tool-web-search-duckduckgo](packages/tools/web-search-duckduckgo/README.md)
- [@sisu-ai/tool-web-search-google](packages/tools/web-search-google/README.md)
- [@sisu-ai/tool-web-search-openai](packages/tools/web-search-openai/README.md)
- [@sisu-ai/tool-wikipedia](packages/tools/wikipedia/README.md)
</details>

<details>
<summary>All examples</summary>

**Anthropic** — [hello](examples/anthropic-hello/README.md) · [control-flow](examples/anthropic-control-flow/README.md) · [stream](examples/anthropic-stream/README.md) · [weather](examples/anthropic-weather/README.md)

**Ollama** — [hello](examples/ollama-hello/README.md) · [stream](examples/ollama-stream/README.md) · [vision](examples/ollama-vision/README.md) · [weather](examples/ollama-weather/README.md) · [web-search](examples/ollama-web-search/README.md)

**OpenAI** — [hello](examples/openai-hello/README.md) · [weather](examples/openai-weather/README.md) · [stream](examples/openai-stream/README.md) · [vision](examples/openai-vision/README.md) · [reasoning](examples/openai-reasoning/README.md) · [react](examples/openai-react/README.md) · [control-flow](examples/openai-control-flow/README.md) · [branch](examples/openai-branch/README.md) · [parallel](examples/openai-parallel/README.md) · [graph](examples/openai-graph/README.md) · [orchestration](examples/openai-orchestration/README.md) · [orchestration-adaptive](examples/openai-orchestration-adaptive/README.md) · [guardrails](examples/openai-guardrails/README.md) · [error-handling](examples/openai-error-handling/README.md) · [rag-chroma](examples/openai-rag-chroma/README.md) · [web-search](examples/openai-web-search/README.md) · [web-fetch](examples/openai-web-fetch/README.md) · [wikipedia](examples/openai-wikipedia/README.md) · [terminal](examples/openai-terminal/README.md) · [github-projects](examples/openai-github-projects/README.md) · [server](examples/openai-server/README.md) · [aws-s3](examples/openai-aws-s3/README.md) · [azure-blob](examples/openai-azure-blob/README.md)
</details>

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
