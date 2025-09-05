# @sisu-ai/tool-terminal

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Ftool-terminal)](https://www.npmjs.com/package/@sisu-ai/tool-terminal)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

A secure terminal execution tool for Sisu agents. Provides sandboxed shell command execution with session support, command allow/deny lists, path scoping, timeouts and basic file helpers.

## API

- `createTerminalTool(config?)` → returns an instance with:
  - methods: `start_session`, `run_command`, `cd`, `read_file`
  - `tools`: an array of Tool definitions (for models): `terminalRun`, `terminalCd`, `terminalReadFile`.

### Defaults & Reuse
- Importable defaults to help you build policies/UI:
  - `DEFAULT_CONFIG` — full default config object
  - `TERMINAL_COMMANDS_ALLOW` — default allowlist array
  - `TERMINAL_COMMANDS_DENY` — default denylist array
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
  commands: { allow: string[]; deny: string[] };
  execution: { timeoutMs: number; maxStdoutBytes: number; maxStderrBytes: number; shell: 'direct'|'sh'|'bash'|'powershell'|'cmd' };
  sessions: { enabled: boolean; ttlMs: number; maxPerAgent: number };
}
```

Sensible defaults: `read: true`, `exec: true`, `write/delete: false`, timeout 10s, `roots: [process.cwd()]`, and a conservative allow/deny command policy. See `DEFAULT_CONFIG` in `src/index.ts` for full details.

## Tool Schemas

- `terminalRun({ command, cwd?, env?, stdin?, sessionId? }) → { exitCode, stdout, stderr, durationMs, policy, cwd }`
- `terminalCd({ path, sessionId? }) → { cwd, sessionId? }`  // creates a session if missing
- `terminalReadFile({ path, encoding?, sessionId? }) → { contents }`

Each tool is validated with zod and registered through the instance’s `tools` array. `start_session` is available as a method for advanced use but is not exposed as a tool by default.

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
- Network-accessing commands are denied by default via patterns (e.g., `curl *`, `wget *`).
- All paths are resolved and constrained to configured `roots`; write/delete under read-only roots are denied.
- Absolute path arguments outside `roots` are denied (e.g., `grep -r /`). Prefer setting `cwd` (via `terminalCd`) and using relative paths.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
