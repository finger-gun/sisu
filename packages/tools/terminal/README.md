# @sisu-ai/tool-terminal

Execute terminal commands safely from agents with scoped paths, timeouts, and command allow-listing.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-terminal)](https://www.npmjs.com/package/@sisu-ai/tool-terminal)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## API

- `createTerminalTool(config?)` → returns an instance with:
  - methods: `start_session`, `run_command`, `cd`, `read_file`
  - `tools`: an array of Tool definitions (for models): `terminalRun`, `terminalCd`, `terminalReadFile`.

### Defaults & Reuse
- Importable defaults to help you build policies/UI:
  - `DEFAULT_CONFIG` — full default config object
  - `TERMINAL_COMMANDS_ALLOW` — default allow list array
  - `defaultTerminalConfig(partial)` — helper to merge your overrides with sensible defaults

## Quick Start

```ts
import 'dotenv/config';
import { Agent, SimpleTools, InMemoryKV, NullStream, createConsoleLogger, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { createTerminalTool } from '@sisu-ai/tool-terminal';

const terminal = createTerminalTool({ roots: [process.cwd()] });

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });
const ctx: Ctx = {
  input: 'List files in the project root and show the first 10 lines of README.md.',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); }))
  .use(traceViewer())
  .use(registerTools(terminal.tools))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(toolCalling);

await app.handler()(ctx);
console.log(ctx.messages.filter(m => m.role === 'assistant').pop()?.content);
```

## Logging & Traces
- Tools emit structured logs via `ctx.log` so runs are visible in traces:
  - `terminalRun`: logs policy pre-check and final result (exit code, duration, bytes).
  - `terminalCd`: logs requested and resolved paths and whether allowed.
  - `terminalReadFile`: logs resolved path and byte size of returned contents.

## Config (subset)

```ts
type TerminalToolConfig = {
  roots: string[];                // allowed path roots (required)
  readOnlyRoots?: string[];
  capabilities: { read: boolean; write: boolean; delete: boolean; exec: boolean };
  commands: { allow: string[] };
  execution: { timeoutMs: number; maxStdoutBytes: number; maxStderrBytes: number; pathDirs: string[] };
  allowPipe?: boolean;      // enable '|'
  allowSequence?: boolean;  // enable ';', '&&', '||'
  sessions: { enabled: boolean; ttlMs: number; maxPerAgent: number };
}
```

Sensible defaults: `read: true`, `exec: true`, `write/delete: false`, timeout 10s, `roots: [process.cwd()]`, `execution.pathDirs` includes common system bins (`/usr/bin:/bin:/usr/local/bin` and `/opt/homebrew/bin` on macOS), and a conservative allow-only command policy. Shell operators are denied by default. You can opt-in to pipelines (`|`) which are executed without a shell, validating each segment.

### PATH Policy
- Fixed PATH: The tool constructs `PATH` from `execution.pathDirs` and ignores any provided `PATH` to prevent PATH hijack (malicious binaries earlier in the search path).
- Recommended dirs:
  - Linux: `/usr/bin`, `/bin`, `/usr/local/bin`.
  - macOS: add `/opt/homebrew/bin` if using Homebrew on Apple Silicon.
- Customize per app: Extend `execution.pathDirs` if your allowed commands live elsewhere (e.g., custom install prefixes). Prefer adding exact directories over inheriting the ambient PATH.
- Environment hygiene: Only `PATH`, `HOME`, `LANG`, and `TERM` are passed through (sanitized). Consider adding absolute paths (e.g., `/usr/bin/grep`) in policies if you want even stronger guarantees.

## Tool Schemas

- `terminalRun({ command, cwd?, env?, stdin?, sessionId? }) → { exitCode, stdout, stderr, durationMs, policy, cwd }`
- `terminalCd({ path, sessionId? }) → { cwd, sessionId? }`  // creates a session if missing
- `terminalReadFile({ path, encoding?, sessionId? }) → { contents }`

Each tool is validated with zod and registered through the instance’s `tools` array. `start_session` is available as a method for advanced use but is not exposed as a tool by default.

### Allowing Operators (Optional)
By default, shell operators are denied. If you need simple operators, enable them explicitly:

```ts
const terminal = createTerminalTool({
  roots: [process.cwd()],
  allowPipe: true,       // allow shell-free pipelines
  allowSequence: true,   // allow ;, &&, || sequencing
});

// Now these work securely without a shell:
await terminal.run_command({ command: "cat README.md | wc -l" });
await terminal.run_command({ command: "ls missing && echo will-not-run; ls || echo ran-on-error" });
```

Notes:
- Each segment must be an allowed verb and passes path checks.
- Redirection (`>`, `<`), command substitution (`$()`/backticks), and backgrounding (`&`) remain blocked.
- Pipelines are executed by wiring processes directly; sequences run segments sequentially with correct semantics.

### When To Use `start_session`
- Persistent cwd across multiple calls: when you plan a sequence like “cd → run → read → run” and want a stable working directory without passing `cwd` every time.
- Pre-seeding env: when a short‑lived, limited env should apply to multiple runs (e.g., `PATH` tweak, `FOO_MODE=1`) without repeating it on each call.
- Deterministic bursts: when you want a TTL‑bounded context that will expire automatically after inactivity (defaults to 2 minutes), avoiding stale state.
- Lower friction than an initial `terminalCd`: prefer `start_session({ cwd, env })` if you already know the starting folder and env.

Example
```ts
const term = createTerminalTool({ roots: [process.cwd()] });
const { sessionId } = term.start_session({ cwd: process.cwd(), env: { FOO_MODE: '1' } });
await term.run_command({ sessionId, command: 'ls -la' });
await term.run_command({ sessionId, command: 'grep -n "TODO" README.md' });
const file = await term.read_file({ sessionId, path: 'README.md' });
```

## Notes

- Non-interactive commands only.
- Network-accessing commands are not in the allow list by default (e.g., `curl`, `wget`).
- Default allowlist includes read-only tools: `pwd`, `ls`, `stat`, `wc`, `head`, `tail`, `cat`, `cut`, `sort`, `uniq`, `grep`.
- All paths are resolved via `realpath` and constrained to configured `roots`; write/delete under read-only roots are denied.
- Absolute or relative path arguments outside `roots` are denied (e.g., `grep -r /`). Prefer setting `cwd` (via `terminalCd`) and using relative paths.
- Commands run without an intermediate shell; tokens like `&&`, `|`, `;`, `$()` and redirections are rejected.

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
