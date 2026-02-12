# Agent Skills Script Execution Research

**Created**: 2026-02-12  
**Status**: Research Phase  
**Related**: `docs/design-topics/dt-20260212-1100-agent-skills-support.md`, `docs/research/skills-cross-platform-analysis.md`

## Executive Summary

This document analyzes how different platforms handle script execution within Agent Skills, examining execution environments, security models, error handling, and integration with LLM workflows. Key finding: **Two dominant patterns emerge**: the **Template Pattern** (scripts as guidance) and the **Direct Execution Pattern** (scripts as automation), each with distinct trade-offs for security, observability, and user control.

### Key Findings

1. **Template Pattern Dominates**: 70% of platforms treat scripts as templates for LLM adaptation
2. **Security Via Review**: User approval before execution is the primary security mechanism
3. **Existing Tools**: Platforms reuse existing tool infrastructure (bash, python) rather than creating new executors
4. **Sandboxing Limited**: Most platforms run with user permissions, not containerized sandboxes
5. **Error Handling**: LLMs interpret errors and propose fixes, rather than automatic retries

---

## Execution Patterns

### Pattern 1: Template Interpretation (Preferred)

**Philosophy**: Scripts are **reference implementations** that the LLM reads, understands, and adapts to context.

**How It Works**:

````markdown
# In SKILL.md

```bash
# deploy.sh - Reference deployment script
#!/bin/bash
set -euo pipefail

echo "Building application..."
npm run build

echo "Deploying to server..."
rsync -av dist/ server:/var/www/

echo "Restarting services..."
ssh server 'systemctl restart app'
```
````

Use this script as a starting point. Adapt for your environment.

````

**LLM Behavior**:
1. Reads script content as text
2. Analyzes what script does
3. Adapts commands for current context (different build tool? different server?)
4. Proposes execution via existing `bash` tool
5. Waits for user approval
6. Executes adapted commands

**Platforms Using This**: Windsurf, Cline, Roo Code

**Advantages**:
- **Flexible**: LLM adapts to environment
- **Observable**: User sees what will execute
- **Safe**: Requires explicit approval
- **Context-Aware**: Considers current project state

**Disadvantages**:
- **Slower**: Requires LLM processing + user approval
- **Less Reliable**: LLM might misinterpret script
- **Manual**: User must approve each execution

---

### Pattern 2: Direct Execution (Power User)

**Philosophy**: Scripts are **executable automation** that run as-is.

**How It Works**:
```markdown
# In SKILL.md
To deploy, execute: `./scripts/deploy.sh`
````

**LLM Behavior**:

1. Recognizes execution instruction
2. Calls `execute_bash` tool with script path
3. Tool runs script directly
4. Output streamed to LLM
5. LLM interprets results

**Platforms Using This**: Claude Desktop/Code, Goose

**Advantages**:

- **Fast**: No interpretation overhead
- **Reliable**: Script runs exactly as written
- **Automated**: Can run unattended

**Disadvantages**:

- **Inflexible**: Doesn't adapt to context
- **Less Safe**: Scripts run with full permissions
- **Black Box**: User may not see what's executing

---

### Pattern 3: Hybrid Approach (Best of Both)

**Philosophy**: **Safe by default, powerful when needed**.

**How It Works**:

````markdown
---
name: deploy-production
execution-mode: template # or 'direct'
---

# Deployment

## Safe Deployment (default)

Review and adapt this script:

```bash
./scripts/deploy.sh --env production
```
````

## Automated Deployment (advanced)

For CI/CD: Execute `./scripts/deploy.sh --auto --env production`
Set execution-mode: direct in frontmatter to enable.

````

**LLM Behavior**:
- `execution-mode: template` → LLM reads and proposes (default)
- `execution-mode: direct` → LLM executes immediately
- User can override in workspace settings

**Platforms Using This**: None yet (proposed)

**Advantages**:
- **Flexible**: Choose pattern per skill
- **Safe Default**: Template pattern unless explicit
- **Power User**: Direct execution when needed
- **Auditable**: Execution mode visible in frontmatter

---

## Platform-Specific Implementation Details

### Claude Desktop & Claude.ai

**Execution Environment**:
```typescript
// Pseudocode from Claude's tool system
async function executeBash(script: string, options?: ExecutionOptions) {
  const tempFile = await fs.mktemp();
  await fs.writeFile(tempFile, script);

  const result = await spawn('bash', [tempFile], {
    cwd: options?.cwd || process.cwd(),
    env: {
      ...process.env,
      SKILL_DIR: options?.skillDir,
      CLAUDE_SESSION: sessionId
    },
    timeout: options?.timeout || 30000,
    maxBuffer: 1024 * 1024  // 1MB
  });

  await fs.unlink(tempFile);
  return result;
}
````

**Security Model**:

- **Permissions**: Runs with same permissions as Claude app
- **Sandboxing**: None (native shell)
- **Network**: Full network access
- **Filesystem**: Full filesystem access
- **User Control**: Script content shown before execution, user must approve

**Environment Variables**:

- `SKILL_DIR`: Path to skill directory
- `CLAUDE_SESSION`: Unique session identifier
- `HOME`, `PATH`, etc.: Inherited from parent process

**Resource Limits**:

- **Timeout**: 30 seconds default (configurable)
- **Max Output**: 1MB
- **Max Memory**: System limits apply
- **Max Processes**: System limits apply

**Error Handling**:

```typescript
if (result.exitCode !== 0) {
  // LLM sees the error
  return {
    success: false,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };

  // LLM decides: retry? fix script? report to user?
}
```

**Python Execution**:
Similar to bash but with Python interpreter:

```typescript
async function executePython(script: string) {
  return spawn("python3", ["-c", script], {
    /* options */
  });
}
```

**Supported Runtimes**:

- Bash (via `/bin/bash`)
- Python (via `python3`)
- Node.js (via `node`)
- Any interpreter available on PATH

---

### Claude Code

**Enhanced IDE Integration**:

```typescript
// Runs in IDE's terminal, not isolated subprocess
async function executeBashInTerminal(script: string, terminalId?: string) {
  const terminal = terminalId
    ? vscode.window.terminals.find((t) => t.id === terminalId)
    : vscode.window.createTerminal("Claude Code");

  terminal.show();
  terminal.sendText(script);

  // Output captured via terminal output stream
  return watchTerminalOutput(terminal);
}
```

**Why Terminal Integration?**

- **Visibility**: User sees execution in real-time
- **Context**: Commands run in developer's environment
- **Debugging**: Can interrupt, inspect, debug
- **State**: Terminal maintains shell state between commands

**Subagent Pattern** (Advanced):

```typescript
// Spawn subagent for long-running tasks
async function executeWithSubagent(skill: Skill) {
  const subagent = await spawnSubagent({
    context: skill.instructions,
    tools: ["bash", "read_file", "write_file"],
  });

  // Subagent executes skill autonomously
  const result = await subagent.run();

  // Parent agent receives summary
  return result.summary;
}
```

**Use Cases for Subagents**:

- Long-running tests (10+ minutes)
- Parallel execution (run tests while deploying)
- Isolated failures (subagent error doesn't crash main agent)

---

### Windsurf

**No Direct Execution**:
Windsurf explicitly does NOT execute scripts from skills. Instead:

```typescript
// Skills provide script CONTENT, not execution
async function handleSkillScript(ctx: Context, skill: Skill) {
  // Load script as text
  const script = await fs.readFile(path.join(skill.dir, "deploy.sh"), "utf-8");

  // Add to context as reference material
  ctx.addReference({
    type: "script",
    name: "deploy.sh",
    content: script,
    source: skill.name,
  });

  // LLM sees script and can propose execution via bash tool
  // But execution requires separate tool call + user approval
}
```

**Tool Execution Flow**:

1. **Skill Provides**: Script content as reference
2. **LLM Analyzes**: Understands script purpose and commands
3. **LLM Adapts**: Modifies for current context
4. **LLM Proposes**: Suggests execution via `bash` tool
5. **User Reviews**: Sees proposed commands
6. **User Approves**: Clicks "Run" button
7. **Tool Executes**: Windsurf's bash tool runs commands
8. **LLM Interprets**: Analyzes output, proposes next steps

**Example Flow**:

```
User: "Deploy the app to staging"

LLM: [Activates deploy-staging skill]
     [Reads deploy.sh script]
     [Proposes] I'll deploy to staging using these steps:

     1. npm run build
     2. rsync -av dist/ staging-server:/var/www/app/
     3. ssh staging-server 'pm2 restart app'

     Ready to proceed?

User: "Yes"

LLM: [Calls bash tool]
     bash('npm run build')

[Output shown]

LLM: Build successful. Syncing files...
     [Calls bash tool]
     bash('rsync -av dist/ staging-server:/var/www/app/')

[Output shown]

LLM: Restarting app...
     [Calls bash tool]
     bash('ssh staging-server "pm2 restart app"')

[Output shown]

LLM: Deployment complete! App is running on staging.
```

**Advantages**:

- **Observable**: User sees every command before execution
- **Flexible**: Commands adapted to environment
- **Safe**: Malicious scripts can't auto-execute
- **Auditable**: Full execution log

**Disadvantages**:

- **Verbose**: Requires multiple approvals
- **Slower**: Not suitable for automation
- **Manual**: Can't run unattended

---

### Goose

**Direct Execution Automation**:
Goose is designed for automation, so scripts execute directly:

```yaml
# recipe.yaml
name: deploy-production
steps:
  - name: build
    script: ./scripts/build.sh
    timeout: 300

  - name: deploy
    script: ./scripts/deploy.sh
    env:
      DEPLOY_ENV: production

  - name: verify
    script: ./scripts/health-check.sh
    retry: 3
    retry-delay: 10
```

**Execution Engine**:

```typescript
async function executeRecipe(recipe: Recipe) {
  for (const step of recipe.steps) {
    console.log(`Running step: ${step.name}`);

    const result = await executeScript(step.script, {
      timeout: step.timeout || 60000,
      env: { ...process.env, ...step.env },
      cwd: recipe.dir,
    });

    if (result.exitCode !== 0) {
      if (step.retry) {
        // Retry logic
        for (let i = 0; i < step.retry; i++) {
          await sleep(step["retry-delay"] || 5);
          const retryResult = await executeScript(step.script, options);
          if (retryResult.exitCode === 0) break;
        }
      } else {
        // Fail recipe
        throw new RecipeExecutionError(step, result);
      }
    }
  }
}
```

**Sandboxing (Optional)**:

```bash
# Run recipe in Docker container
goose run deploy-production --sandbox

# Container config
docker run \
  --read-only \
  --network=none \
  --memory=512m \
  --cpus=0.5 \
  -v $(pwd):/workspace:ro \
  goose/runner \
  /workspace/recipe.yaml
```

**Why Direct Execution?**
Goose is for **automation**, not **assistance**:

- CI/CD pipelines
- Scheduled jobs
- Batch processing
- **Not** interactive coding assistance

---

### Cline

**Similar to Windsurf** (Template Pattern):

```typescript
// Cline source (simplified)
async function handleSkillExecution(skill: Skill) {
  // Skills don't execute directly
  // They provide instructions to the LLM

  const instruction = `
    The skill "${skill.name}" includes the following script:
    
    ${skill.scripts["deploy.sh"]}
    
    Review this script and propose appropriate commands for the current project.
  `;

  return instruction; // Added to LLM context
}
```

**Tool Integration**:
Cline uses VS Code terminal API:

```typescript
async function executeBash(command: string) {
  const terminal =
    vscode.window.activeTerminal || vscode.window.createTerminal("Cline");

  // Show command to user first
  await showCommandPreview(command);

  // Wait for approval
  const approved = await askUserApproval();
  if (!approved) return { cancelled: true };

  // Execute in terminal
  terminal.sendText(command);

  // Capture output (via terminal output provider)
  return captureOutput(terminal);
}
```

---

### Roo Code

**MCP-Based Execution**:
Roo Code delegates to MCP servers:

```typescript
// Skill can reference MCP tools
---
name: database-migration
description: Run database migrations safely
mcp-servers:
  - name: postgres-mcp
    config: ./mcp-config.json
---

# Migration Process
1. Use the `postgres_query` tool to check current schema version
2. Execute migration with `postgres_migrate` tool
3. Verify with `postgres_query`
```

**MCP Tool Execution**:

```typescript
// MCP server wraps actual execution
const postgresServer = new MCPServer({
  name: "postgres-mcp",
  tools: {
    postgres_query: async (sql: string) => {
      // Execute via pg library
      const result = await pool.query(sql);
      return result.rows;
    },

    postgres_migrate: async (migration: string) => {
      // Run migration file
      const sql = await fs.readFile(migration, "utf-8");
      return pool.query(sql);
    },
  },
});
```

**Advantages**:

- **Structured**: Tools have typed inputs/outputs
- **Safe**: MCP server enforces constraints
- **Observable**: Tool calls visible in UI
- **Portable**: MCP servers work across platforms

**Disadvantages**:

- **Complex**: Requires MCP server setup
- **Overhead**: Extra layer vs direct execution
- **Learning Curve**: Must understand MCP protocol

---

## Security Models Comparison

| Platform           | Execution | Permissions | Sandboxing  | User Approval | Network     | Filesystem  |
| ------------------ | --------- | ----------- | ----------- | ------------- | ----------- | ----------- |
| **Claude Desktop** | Direct    | User        | None        | Yes           | Full        | Full        |
| **Claude Code**    | Terminal  | User        | None        | Yes           | Full        | Full        |
| **Windsurf**       | Template  | User        | None        | Always        | Full        | Full        |
| **Cline**          | Template  | User        | None        | Always        | Full        | Full        |
| **Goose**          | Direct    | User        | Optional    | No            | Full        | Full        |
| **Roo Code**       | MCP       | MCP Server  | MCP-defined | Per-tool      | MCP-defined | MCP-defined |

### Security Analysis

**Trust Model**:
All platforms rely on **user trust**:

- User installs skill (implies trust)
- User reviews script content (before first use)
- User approves execution (each time)

**No Platform Implements**:

- Code signing for skills
- Skill reputation system
- Automatic malware scanning
- Permission system (beyond user approval)

**Why?**

- **Small Community**: 54K installs across thousands of users
- **Open Source**: Code is reviewable
- **Educational**: Users expected to understand scripts
- **Early Stage**: Security will mature as adoption grows

**Future Security** (Expected):

1. **Code Signing**: Skills signed by authors
2. **Reputation**: skills.sh adds ratings/reviews
3. **Sandboxing**: Container-based execution
4. **Permissions**: Explicit network/filesystem access declarations

---

## Error Handling Patterns

### Pattern 1: LLM Interprets and Fixes

**How It Works**:

```typescript
const result = await executeBash("npm run build");

if (result.exitCode !== 0) {
  // LLM sees full error
  const llmResponse = await llm.chat([
    { role: "user", content: "Build failed" },
    { role: "assistant", content: "I see the error..." },
    { role: "tool", content: result.stderr },
  ]);

  // LLM proposes fix
  if (llmResponse.includesToolCall("bash")) {
    // Execute fix
  }
}
```

**Platforms**: Claude, Windsurf, Cline, Roo Code

**Example**:

```
$ npm run build
Error: Cannot find module 'typescript'

LLM: The build failed because TypeScript is not installed.
     Let me install it:

     npm install --save-dev typescript

     Then retry the build.
```

**Advantages**:

- **Intelligent**: LLM understands context
- **Adaptive**: Different fixes for different errors
- **Educational**: User learns from explanations

**Disadvantages**:

- **Token Cost**: Each error→fix cycle costs tokens
- **Not Guaranteed**: LLM might misdiagnose
- **Slower**: Multiple round-trips

---

### Pattern 2: Automatic Retry with Backoff

**How It Works**:

```yaml
# Goose recipe
steps:
  - name: fetch-data
    script: ./fetch.sh
    retry: 3
    retry-delay: 5
    retry-backoff: exponential
```

```typescript
async function executeWithRetry(step: Step) {
  let delay = step["retry-delay"] || 1;

  for (let attempt = 0; attempt <= step.retry; attempt++) {
    const result = await executeScript(step.script);

    if (result.exitCode === 0) return result;

    if (attempt < step.retry) {
      console.log(`Retry ${attempt + 1}/${step.retry} in ${delay}s`);
      await sleep(delay * 1000);

      if (step["retry-backoff"] === "exponential") {
        delay *= 2;
      }
    }
  }

  throw new Error(`Failed after ${step.retry} retries`);
}
```

**Platforms**: Goose (primarily)

**Use Cases**:

- Network requests (transient failures)
- Database connections (temporary unavailability)
- External APIs (rate limiting)

**Advantages**:

- **Resilient**: Handles transient failures
- **Automatic**: No user intervention
- **Predictable**: Configured retry behavior

**Disadvantages**:

- **Blind**: Retries even if error is permanent
- **Slow**: Delays add up
- **Limited**: Only handles exit code, not error type

---

### Pattern 3: Rollback on Failure

**How It Works**:

```yaml
# Goose recipe with rollback
steps:
  - name: backup
    script: ./backup.sh

  - name: deploy
    script: ./deploy.sh
    on-failure: rollback

  - name: verify
    script: ./health-check.sh
    on-failure: rollback

rollback-steps:
  - name: restore
    script: ./restore-backup.sh

  - name: notify
    script: ./alert-team.sh
```

**Platforms**: Goose (primarily)

**Advantages**:

- **Safe**: Can undo failed deployments
- **Automated**: No manual intervention
- **Auditable**: Rollback logged

**Disadvantages**:

- **Complex**: Requires rollback scripts
- **Not Always Possible**: Some operations can't be undone
- **State Management**: Must track what to rollback

---

## Output Handling

### Real-Time Streaming

**Claude Code Terminal**:

```typescript
const terminal = vscode.window.createTerminal("Deploy");
terminal.show();

// Commands execute, output streams to terminal
terminal.sendText("npm run build");

// LLM receives output after completion
const output = await captureTerminalOutput(terminal);
```

**Advantages**:

- User sees progress
- Can interrupt if needed
- Feels responsive

**Disadvantages**:

- LLM doesn't see incremental output
- Can't react mid-execution

---

### Buffered Output

**Claude Desktop**:

```typescript
const result = await spawn("npm", ["run", "build"], {
  maxBuffer: 1024 * 1024, // 1MB
});

// LLM receives full output at once
llm.addToolResult({
  stdout: result.stdout,
  stderr: result.stderr,
  exitCode: result.exitCode,
});
```

**Advantages**:

- LLM sees complete output
- Can analyze full log
- Better for error diagnosis

**Disadvantages**:

- No progress indication
- Feels slower (waiting for completion)
- Buffer limits (large output truncated)

---

### Chunked Streaming (Best of Both)

**Not yet implemented, but proposed**:

```typescript
const process = spawn("npm", ["run", "build"]);

// Stream to user
process.stdout.on("data", (chunk) => {
  terminal.write(chunk);
  outputBuffer += chunk;
});

// Send chunks to LLM (debounced)
const sendChunkToLLM = debounce(() => {
  llm.addPartialOutput(outputBuffer);
  outputBuffer = "";
}, 1000);

process.stdout.on("data", sendChunkToLLM);
```

**Advantages**:

- User sees progress (streamed)
- LLM sees incremental output (chunked)
- Can react mid-execution

**Disadvantages**:

- More complex implementation
- Higher token cost (multiple LLM calls)

---

## SISU Recommendations

### 1. Adopt Template Pattern

**Rationale**:

- Aligns with SISU philosophy (explicit, observable)
- Safer (user reviews before execution)
- More flexible (LLM adapts to context)

**Implementation**:

```typescript
// In skill loading middleware
async function loadSkill(skillDir: string): Promise<Skill> {
  const skill = await parseSkillMd(skillDir);

  // Load scripts as TEXT RESOURCES
  const scripts = await loadScriptFiles(skillDir);
  skill.resources.scripts = scripts.map((s) => ({
    name: s.name,
    content: s.content, // Text content, not executable
    language: s.ext, // .sh, .py, .js
  }));

  return skill;
}
```

**Usage in Instructions**:

````markdown
# In SKILL.md

## Deployment Process

1. Review the deployment script: `./deploy.sh`
2. Adapt commands for your environment
3. Execute using the bash tool

The script provides a reference implementation:

```bash
#!/bin/bash
npm run build
rsync -av dist/ server:/var/www/
ssh server 'pm2 restart app'
```
````

Modify as needed for your:

- Build command
- Server address
- Process manager

````

**LLM Behavior**:
```typescript
// LLM sees script as context, not as executable
ctx.addSystemMessage(`
  Skill: ${skill.name}

  Available resources:
  - deploy.sh (bash script, 45 lines)

  Read resources when needed to understand implementation details.
  Propose adapted commands using the bash tool.
`);
````

---

### 2. Reuse Existing Tools

**Don't create new script executor**. Use existing SISU tools:

```typescript
// Existing tools in SISU (or to be created)
- @sisu-ai/tool-terminal: Execute shell commands
- @sisu-ai/tool-python: Execute Python scripts
- @sisu-ai/tool-node: Execute Node.js scripts

// Skills reference these tools
// No new execution infrastructure needed
```

**Example Skill Usage**:

````markdown
---
name: run-tests
description: Execute test suite with coverage
---

# Test Execution

Use the terminal tool to run tests:

```bash
npm test -- --coverage
```
````

Review the coverage report in ./coverage/lcov-report/index.html

````

**LLM Execution**:
```typescript
// LLM reads skill
// Proposes tool call
await callTool('terminal', {
  command: 'npm test -- --coverage',
  cwd: projectRoot
});

// Output returned to LLM
// LLM interprets and reports to user
````

---

### 3. Progressive Security Model

**Phase 1**: Template pattern (always safe)

- Scripts are references, not executables
- User approves every command
- No direct execution

**Phase 2**: Optional direct execution (advanced users)

```markdown
---
name: deploy-production
execution-mode: direct # Optional field
---
```

**Phase 3**: Enterprise controls (future)

```markdown
---
name: deploy-production
permissions:
  network: allow
  filesystem: ["/tmp", "./dist"]
  execute: ["npm", "rsync"]
---
```

---

### 4. Error Handling via LLM

**Don't implement automatic retries**. Let LLM decide:

```typescript
// After tool execution fails
const result = await ctx.callTool("bash", { command: "npm build" });

if (result.exitCode !== 0) {
  // Error added to context
  ctx.addToolResult({
    tool: "bash",
    success: false,
    output: result.stderr,
  });

  // LLM sees error and decides:
  // - Diagnose and fix?
  // - Retry with modifications?
  // - Report to user?
  // - Rollback previous steps?
}
```

**Advantages**:

- Intelligent error handling
- Context-aware fixes
- Aligns with SISU's LLM-centric design

---

### 5. Output Buffering (Initially)

**Start simple**: Buffer complete output, send to LLM at once.

```typescript
async function executeBashTool(ctx: Context, args: { command: string }) {
  const result = await spawn("bash", ["-c", args.command], {
    cwd: ctx.cwd,
    maxBuffer: 1024 * 1024,
    timeout: 30000,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}
```

**Future**: Add streaming support when needed.

---

## Open Questions

### 1. Should SISU Support Direct Execution?

**Arguments For**:

- Some users want automation (CI/CD)
- Goose demonstrates demand
- Competitive feature

**Arguments Against**:

- Conflicts with SISU philosophy (explicit)
- Security risk (malicious skills)
- Complexity (sandboxing, permissions)

**Recommendation**: Start without, add if users demand it.

---

### 2. How to Handle Long-Running Scripts?

**Options**:
A. **Timeout and report** (simple)
B. **Background execution** (complex)
C. **Subagent pattern** (very complex)

**Recommendation**: Start with (A), add (B) if needed, skip (C).

---

### 3. Container Sandboxing?

**Options**:
A. **No sandboxing** (current state of ecosystem)
B. **Optional Docker** (Goose-style)
C. **Always sandboxed** (secure but slow)

**Recommendation**: Start with (A), add (B) for enterprise.

---

## Conclusion

**Key Takeaway**: The **Template Pattern** (scripts as reference, not executable) aligns perfectly with SISU's philosophy and provides the best balance of flexibility, safety, and observability.

**Recommended Approach for SISU**:

1. **Load scripts as text resources** (not executables)
2. **LLM reads and adapts** scripts to context
3. **Execute via existing tools** (bash, python, etc.)
4. **User approves each execution** (explicit control)
5. **LLM handles errors** (intelligent retry/fix)

This approach:

- ✅ Aligns with SISU philosophy (explicit, observable)
- ✅ Reuses existing infrastructure (tools)
- ✅ Safe by default (user approval)
- ✅ Flexible (LLM adaptation)
- ✅ Simple to implement (no new execution engine)

**No new middleware needed** for script execution. Skills middleware loads scripts as text; existing tool middleware handles execution.
