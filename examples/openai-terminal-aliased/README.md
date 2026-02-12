# OpenAI Terminal Aliased Example

This example demonstrates **SISU's tool alias feature**, which allows you to register tools with ecosystem-compatible alternative names.

## What This Example Shows

- How to register terminal tools with custom aliases
- How aliases make tools compatible with ecosystem standards (e.g., Cline skills)
- How the model calls tools using alias names (e.g., `bash` instead of `terminalRun`)
- How SISU internally resolves aliases back to canonical names for execution
- Full transparency through trace files showing both alias and canonical names

## Tool Aliases Used

| Canonical Name     | Alias       | Description            |
| ------------------ | ----------- | ---------------------- |
| `terminalRun`      | `bash`      | Execute shell commands |
| `terminalReadFile` | `read_file` | Read file contents     |
| `terminalCd`       | `cd`        | Change directory       |

## Why Use Aliases?

**Ecosystem Compatibility**: Different AI agent frameworks and skills use different naming conventions. Tool aliases allow you to:

- Make your tools compatible with existing skills (e.g., Cline skills expect `bash`, `read_file`, etc.)
- Follow ecosystem conventions without changing SISU's internal tool names
- Support multiple naming conventions simultaneously

**Opt-In Design**: Aliases are completely optional. If you don't provide them, tools use their canonical SISU names.

## Running the Example

```bash
# From the repository root
pnpm --filter=openai-terminal-aliased dev

# Or with custom input
USER_INPUT="List all TypeScript files in the src directory" pnpm --filter=openai-terminal-aliased dev
```

## What Happens

1. Tools are registered with aliases: `terminalRun` → `bash`, etc.
2. Tool-calling middleware renames tools before sending to OpenAI API
3. Model receives tools with alias names: `bash`, `read_file`, `cd`
4. Model calls tools using alias names in responses
5. Tool-calling middleware resolves aliases back to canonical names
6. SISU executes the correct handler using the canonical name from the registry
7. Trace file shows both alias and canonical names for debugging

## Viewing the Trace

After running, open the generated `trace-*.html` file to see:

- Tools sent to API with alias names
- Model's tool calls using aliases
- Alias resolution logs showing "bash → terminalRun"
- Tool execution with canonical names

## Key Code

```typescript
import { registerTools } from '@sisu-ai/mw-register-tools';
import { createTerminalTool } from '@sisu-ai/tool-terminal';

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, delete: false, exec: true },
});

// Register with aliases
.use(registerTools(terminal.tools, {
  aliases: {
    'terminalRun': 'bash',
    'terminalReadFile': 'read_file',
    'terminalCd': 'cd'
  }
}))
```

## Learn More

- See `/packages/middleware/register-tools/README.md` for full alias documentation
- See `/packages/middleware/tool-calling/src/index.ts` for implementation details
- Compare with `/examples/openai-terminal/` to see the same functionality without aliases
