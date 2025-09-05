# OpenAI Terminal Tool Example

Demonstrates the sandboxed terminal tool (`@sisu-ai/tool-terminal`) with OpenAI tool-calling. The model can choose tools like `terminalRun`, `terminalCd`, and `terminalReadFile` to inspect the local workspace safely.

### How It Works
- Agent stack: OpenAI adapter + tool-calling middleware + trace viewer. See `src/index.ts`.
- Tool registration: `createTerminalTool({ roots: [process.cwd()] })` then `registerTools(terminal.tools)` exposes the terminal tools to the model.
- Policy: Commands and file access are constrained to `roots` with allow/deny lists. Destructive or network commands are denied; absolute paths outside `roots` are blocked.
- Sessions: Not required for simple calls. `terminalCd` creates a session if missing, keeping cwd across calls. `start_session` exists as an advanced method.
- Traces: Tools log policy checks and results via `ctx.log`, and the trace viewer writes an HTML file under `traces/`.

### What This Tool Is Good For
- File discovery in a repo: list directories, grep for strings, show small file snippets.
- Reading files safely: prefer `terminalReadFile` over `cat` when only contents are needed.
- Light project automation: run `npm run <script>`, `node` tasks, or simple Unix text tools (head/tail/grep/find).
- Local workflows without host risk: roots/sessions/deny-lists prevent escaping or destructive operations.

### Run The Example
```bash
# 1) Ensure deps are installed and built at repo root
npm install
npm run build -ws

# 2) Run the example with tracing enabled
MODEL=gpt-4o-mini npm run dev -w examples/openai-terminal -- --trace

# An HTML trace should appear in examples/openai-terminal/traces
```

### Tips
- Prefer relative paths under the current `cwd`; avoid absolute paths. Example: use `grep -rl "needle" .` not `grep -rl "needle" /`.
- For multiple steps in one folder, call `terminalCd` first, then run several `terminalRun`/`terminalReadFile` calls with the returned `sessionId`.
- Keep outputs small: the tool truncates very large stdout/stderr; refine commands to reduce noise.
