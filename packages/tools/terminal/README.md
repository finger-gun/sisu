# @sisu-ai/tool-terminal

A secure terminal execution tool for Sisu agents. Provides sandboxed command execution with session support, a strict allow list, realpath-based path scoping, timeouts and basic file helpers. Commands run without a shell and reject control operators by default; optional shell-free pipelines (`|`) and sequences (`;`, `&&`, `||`) can be enabled via config.

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
