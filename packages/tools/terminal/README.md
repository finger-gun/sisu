# @sisu-ai/tool-terminal

A secure terminal execution tool for Sisu agents. Provides sandboxed shell command execution with session support, command allow/deny lists, path scoping, timeouts and basic file helpers.

## API Footprint

- `createTerminalTool(config?)` → returns an instance with:
  - methods: `start_session`, `run_command`, `cd`, `read_file`
  - `tools`: an array of Tool definitions (for models): `terminalRun`, `terminalCd`, `terminalReadFile`.

## Quick Start

```ts
import { createTerminalTool } from '@sisu-ai/tool-terminal';

const term = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
});

// No session required for simple commands
const res = await term.run_command({ command: 'ls -la', cwd: process.cwd() });
console.log(res.stdout);
```

## Using with an Agent (Tool-Calling)

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
  input: 'List files in the project root and show the first 10 lines of README.md. Use tools if helpful.',
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

## Notes

- Non-interactive commands only.
- Network-accessing commands are denied by default via patterns (e.g., `curl *`, `wget *`).
- All paths are resolved and constrained to configured `roots`; write/delete under read-only roots are denied.
