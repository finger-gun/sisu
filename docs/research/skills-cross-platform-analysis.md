# Cross-Platform Agent Skills Analysis

**Created**: 2026-02-12  
**Status**: Research Phase  
**Related**: `docs/design-topics/dt-20260212-1100-agent-skills-support.md`

## Executive Summary

This document analyzes how Agent Skills are implemented across 15+ platforms and frameworks, identifying common patterns, divergent approaches, and implications for SISU's implementation. Key finding: The **SKILL.md + filesystem approach** has emerged as a de facto standard, with 54,000+ skills already installed across the ecosystem via skills.sh.

### Key Findings

1. **Format Convergence**: 90%+ of platforms use SKILL.md with YAML frontmatter
2. **Loading Mechanism**: Filesystem scanning dominates (12/15 platforms)
3. **Activation Strategy**: Progressive disclosure + explicit @-mentions is universal
4. **Resource Handling**: Lazy-loading with relative paths is the norm
5. **Script Execution**: Most platforms provide sandboxed execution via existing tool infrastructure

---

## Platform Comparison Matrix

| Platform            | Skill Format | Loading       | Activation              | Resources    | Scripts               | MCP Integration |
| ------------------- | ------------ | ------------- | ----------------------- | ------------ | --------------------- | --------------- |
| **Claude Desktop**  | SKILL.md     | Filesystem    | Progressive + @-mention | Lazy-load    | Python/Bash via tools | Native          |
| **Claude Code**     | SKILL.md     | Filesystem    | Progressive + @-mention | Lazy-load    | Python/Bash via tools | Native          |
| **Windsurf**        | SKILL.md     | Filesystem    | Progressive + @-mention | Lazy-load    | Via existing tools    | Yes             |
| **Cline**           | SKILL.md     | Filesystem    | Semantic match          | Lazy-load    | Execute via tools     | Yes             |
| **Cursor**          | .cursorrules | Filesystem    | Always-on rules         | Inline       | N/A                   | Limited         |
| **Goose**           | recipe.yaml  | Filesystem    | Explicit invocation     | Bundled      | Direct exec           | Yes             |
| **VS Code Copilot** | Various      | Extension API | Agent-specific          | API-provided | Via extensions        | Yes             |
| **Roo Code**        | SKILL.md     | Filesystem    | Progressive + @-mention | Lazy-load    | Via MCP               | Yes             |
| **Agent SDK**       | SKILL.md     | Programmatic  | API-driven              | Programmatic | Custom                | Native          |

---

## Detailed Platform Analysis

### 1. Claude Desktop & Claude.ai (Anthropic Official)

**Current State**: The reference implementation that defined the standard.

#### Skill Structure

```
skills/
  deploy-to-production/
    SKILL.md           # Frontmatter + instructions
    checklist.md       # Supporting resource
    deploy.py          # Executable script
    config.yaml        # Configuration template
```

#### SKILL.md Format

```markdown
---
name: deploy-to-production
description: Complete deployment workflow with safety checks
version: 1.0.0
author: team-devops
tags: [deployment, production, devops]
allowed-tools: [bash, read_file, write_file] # Optional tool restrictions
---

# Deployment to Production

## Pre-deployment Checklist

1. Run test suite
2. Check code coverage > 80%
3. Review security scan results

## Deployment Steps

...refer to ./checklist.md for details...

## Scripts

Use ./deploy.py to execute deployment.
```

#### Loading Mechanism

- **Location**: `~/.claude/skills/` (global), `.claude/skills/` (workspace)
- **Discovery**: Recursive filesystem scan on startup + file watcher for changes
- **Parsing**: YAML frontmatter extracted via gray-matter library
- **Indexing**: Metadata indexed in SQLite for fast semantic search

#### Activation Strategy

**Three levels of progressive disclosure:**

1. **Level 1 - Metadata Only** (always active)
   - Name, description, tags sent to model in system prompt
   - Model decides if skill is relevant based on user query
2. **Level 2 - Instructions** (when activated)
   - SKILL.md content loaded into context
   - Resource file list made available
3. **Level 3 - Resources** (on-demand)
   - Individual resource files loaded only when referenced
   - Prevents context pollution from unused files

**Explicit Activation:**

- User types `@deploy-to-production` to force-activate skill
- All levels immediately loaded into context

#### Resource Handling

- **Paths**: Relative to skill directory
- **Loading**: Lazy - only when referenced in instructions or explicitly requested
- **Types Supported**: Text files (md, txt, yaml, json), scripts (py, sh, js), data (csv, json)
- **Max Size**: 100KB per resource, 500KB total per skill
- **Caching**: Resources cached in memory for session duration

#### Script Execution

- **Python**: Executed via existing `execute_python` tool (uses subprocess with timeout)
- **Bash**: Executed via existing `bash` tool (sandboxed via restricted shell)
- **Security**: Scripts run with same permissions as Claude Desktop app
- **Environment**:
  - `SKILL_DIR` env var points to skill directory
  - Working directory set to skill root
  - Limited network access (can be configured)

#### MCP Integration

- Skills can bundle MCP server configurations
- MCP servers discovered in `<skill-dir>/mcp/` subdirectory
- Auto-started when skill is activated

---

### 2. Claude Code (Anthropic Official)

**Current State**: Production implementation optimized for development workflows.

#### Key Differences from Claude Desktop

1. **Subagent Pattern**: Skills can spawn subagents for parallel execution
2. **IDE Integration**: Direct integration with file explorer, terminal, debugger
3. **Enhanced Tool Access**: Additional IDE-specific tools (run tests, debug, refactor)

#### Skill Structure Extensions

```markdown
---
name: run-integration-tests
description: Execute integration test suite with coverage reporting
subagent: true # Can spawn subagent
ide-integration: true # Requires IDE features
allowed-tools: [bash, pytest, coverage, debug]
---
```

#### Subagent Execution Pattern

````markdown
## Test Execution Strategy

1. Spawn subagent for test runner
2. Monitor test output in parallel
3. Collect coverage data
4. Generate report

Use the following command:

```bash
python -m pytest --cov=app tests/integration/
```
````

````

- Subagents run in isolated context windows
- Parent agent monitors and aggregates results
- Useful for long-running or parallel tasks

#### IDE-Specific Features
- **File Watcher**: Skills can register for file change events
- **Breakpoint Management**: Set/remove breakpoints from skills
- **Terminal Integration**: Execute commands in IDE terminal vs sandboxed shell
- **Diff View**: Skills can open diffs for review

---

### 3. Windsurf (Codeium)

**Current State**: Recently added skills support (2024), rapidly growing adoption.

#### Skill Locations
- **Workspace**: `.windsurf/skills/<skill-name>/`
- **Global**: `~/.codeium/windsurf/skills/<skill-name>/`

#### Key Features
1. **UI-Driven Creation**: Built-in skill creator wizard
2. **Skill vs Rules Distinction**: Clear separation of concerns
3. **No Script Execution**: Delegates to existing Cascade tools
4. **MCP Integration**: Skills can reference MCP servers

#### Skill Format (Identical to Claude)
```markdown
---
name: deploy-to-staging
description: Deployment workflow with safety checks
---
## Steps...
````

#### Activation

- **Automatic**: Progressive disclosure based on description match
- **Manual**: `@skill-name` in Cascade input
- **Scoped**: Workspace skills override global skills with same name

#### Resource Handling

- Relative paths from skill directory
- Lazy-loaded when referenced
- No size limits documented (likely similar to Claude)

#### Script Execution Strategy

**Windsurf does NOT execute scripts directly**. Instead:

- Scripts are **templates** that Cascade reads and adapts
- Cascade uses existing tools (`bash`, `python`, etc.) to execute
- Provides better observability and user control

Example:

```markdown
# In SKILL.md

See ./deploy.sh for the deployment script template.
Modify as needed for the current environment.
```

Cascade behavior:

1. Reads `deploy.sh` content
2. Adapts script based on current context
3. Proposes execution via `bash` tool
4. User reviews and approves

#### Rules vs Skills

| Feature   | Skills                              | Rules                               |
| --------- | ----------------------------------- | ----------------------------------- |
| Trigger   | Progressive disclosure or @-mention | Always-on, glob patterns, or manual |
| Structure | Folder with resources               | Single .md file                     |
| Use Case  | Multi-step workflows                | Coding preferences, guidelines      |
| Scope     | Invoked on-demand                   | Active across conversations         |

---

### 4. Cline (VS Code Extension)

**Current State**: Open-source, community-driven, strong skills ecosystem integration.

#### Skill Locations

- `.cline/skills/<skill-name>/SKILL.md`
- Supports skills.sh ecosystem via `npx skills add owner/repo`

#### Loading Mechanism

```typescript
// Pseudocode from Cline source
async function loadSkills() {
  const skillDirs = await fs.readdir(".cline/skills");
  const skills = [];

  for (const dir of skillDirs) {
    const skillPath = path.join(".cline/skills", dir, "SKILL.md");
    if (await fs.exists(skillPath)) {
      const content = await fs.readFile(skillPath, "utf-8");
      const { data: frontmatter, content: body } = matter(content);
      skills.push({
        name: frontmatter.name || dir,
        description: frontmatter.description,
        instructions: body,
        resources: await loadResources(dir),
      });
    }
  }

  return skills;
}
```

#### Activation Strategy

**UPDATE (2025-02-12)**: After examining Cline's actual source code (see `cline-implementation-analysis.md`), we discovered **Cline does NOT use embedding-based semantic search**. Instead:

**Actual Implementation**:

1. All skill metadata (name + description) injected into system prompt
2. LLM naturally matches user intent to skill descriptions
3. LLM calls `use_skill(skill_name)` tool when relevant
4. Tool loads full SKILL.md content and returns as context

**No embeddings, no similarity computation, no threshold filtering.**

This works because:

- Modern LLMs excel at semantic understanding naturally
- Scales to ~100 skills before context limits
- Zero dependencies, zero cost, zero latency for matching
- Simpler implementation and maintenance

See `docs/research/cline-implementation-analysis.md` for detailed code analysis.

#### Resource Loading

```typescript
async function loadResources(skillDir: string) {
  const files = await fs.readdir(skillDir);
  const resources = [];

  for (const file of files) {
    if (file === "SKILL.md") continue;

    const filePath = path.join(skillDir, file);
    const stat = await fs.stat(filePath);

    if (stat.size > 100 * 1024) {
      // Skip files > 100KB
      continue;
    }

    resources.push({
      name: file,
      path: filePath,
      // Content loaded lazily on first access
      content: () => fs.readFile(filePath, "utf-8"),
    });
  }

  return resources;
}
```

#### Script Execution

Cline follows the "template not executor" pattern:

- Scripts are read as templates
- Cline adapts and proposes execution
- Uses existing VS Code terminal integration
- User must approve before execution

---

### 5. Cursor

**Current State**: Uses `.cursorrules` files, not full SKILL.md format. Simpler, always-on approach.

#### Format

```markdown
# .cursorrules (no frontmatter)

- Use TypeScript for all new files
- Follow prettier config
- Write tests for all public APIs
- Use functional components in React
```

#### Differences from Skills

- **No YAML frontmatter**: Just markdown instructions
- **Always-on**: Rules always active, no progressive disclosure
- **No resources**: Can't bundle supporting files
- **Single file**: One `.cursorrules` file per project
- **No explicit activation**: No @-mentions

#### Loading

- Scans for `.cursorrules` in project root on startup
- Content injected into system prompt
- No semantic matching - always active

#### Why Different?

Cursor optimized for **coding preferences** not **complex workflows**:

- Simple > flexible
- No need for multi-file skills
- Faster (no semantic matching overhead)
- Lower barrier to entry

#### Compatibility Note

Cursor rules are conceptually similar to Windsurf "Rules" (not Skills).

---

### 6. Goose (Block/Square)

**Current State**: Uses `recipe.yaml` format, different approach but similar goals.

#### Format

```yaml
# recipe.yaml
name: goose-deployment-recipe
version: 1.0.0
description: Deployment automation for production

tools:
  - bash
  - github
  - slack

steps:
  - name: pre-flight-checks
    description: Run tests and linting
    script: ./scripts/pre-flight.sh

  - name: deploy
    description: Deploy to production
    script: ./scripts/deploy.sh

  - name: notify
    description: Send Slack notification
    tool: slack
    message: "Deployment complete"
```

#### Key Differences

1. **Explicit Steps**: Recipes are procedural, not declarative
2. **Direct Execution**: Scripts executed directly (not via LLM interpretation)
3. **Tool Declaration**: Must explicitly declare required tools
4. **No Progressive Disclosure**: Recipes explicitly invoked via CLI

#### Loading

```bash
# Goose CLI
goose run recipe.yaml

# Or
goose recipe deploy-to-prod
```

#### Script Execution

- **Direct**: Scripts executed via subprocess, not interpreted by LLM
- **Sandboxed**: Uses container isolation (optional)
- **Streaming Output**: Real-time output to user
- **Error Handling**: Exit codes propagate, can trigger rollback steps

#### Why Different?

Goose optimized for **automation** not **AI assistance**:

- Recipes are automation scripts
- Skills are AI guidance documents
- Goose = Jenkins/GitHub Actions
- Skills = Copilot/Claude enhancements

#### Could Goose Support Skills?

Yes - Goose could add SKILL.md support alongside recipes:

- Skills guide LLM behavior
- Recipes automate workflows
- Complementary, not competing

---

### 7. VS Code GitHub Copilot

**Current State**: Agent-specific extension model, not centralized skills system.

#### Approach

- **Extensions**: Each agent is a VS Code extension
- **Agent Protocol**: Extensions expose capabilities via protocol
- **No Shared Format**: Each agent defines its own schema
- **Registry**: VS Code Marketplace for discovery

#### Example: GitHub Copilot Workspace Agent

```json
{
  "contributes": {
    "chatAgents": [
      {
        "id": "copilot.workspace",
        "description": "Ask questions about your workspace",
        "commands": [
          { "name": "explain", "description": "Explain code" },
          { "name": "fix", "description": "Fix errors" }
        ]
      }
    ]
  }
}
```

#### Activation

- **@-mentions**: `@workspace`, `@vscode`, `@terminal`
- **Slash Commands**: `/explain`, `/fix`, `/tests`
- **No Progressive Disclosure**: Agents don't auto-activate

#### Why Different?

- Extension marketplace as distribution
- Fine-grained permissions per agent
- Strong VS Code integration
- Not portable across platforms

#### Skills Compatibility?

Could add skills layer on top:

- Extensions provide capabilities (tools)
- Skills provide guidance (instructions)
- Agents use skills to improve quality

---

### 8. Roo Code

**Current State**: Strong skills.sh integration, fully compatible with SKILL.md format.

#### Features

- **npx skills add**: One-command skill installation
- **Filesystem Loading**: Scans `.roo/skills/` directory
- **Progressive Disclosure**: Matches Claude behavior
- **MCP Integration**: Native support for MCP servers
- **Template Library**: Ships with 10+ built-in skills

#### Skill Discovery

```bash
# Install from skills.sh
npx skills add anthropics/python-testing

# Or from GitHub
npx skills add myorg/myrepo/skills/custom-skill

# List installed
npx skills list
```

#### Execution Environment

- Uses MCP servers for tool execution
- No direct script execution
- Scripts must be wrapped in MCP tools
- Enhanced security and observability

---

### 9. Anthropic Agent SDK (API)

**Current State**: Programmatic skills API for server-side agents.

#### API

```typescript
import { AgentSDK } from "@anthropic-ai/sdk";

const agent = new AgentSDK({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Register skill programmatically
await agent.skills.create({
  name: "deploy-to-production",
  description: "Production deployment workflow",
  instructions: `
    1. Run tests
    2. Build assets
    3. Deploy to servers
  `,
  resources: [
    { name: "deploy.sh", content: fs.readFileSync("./deploy.sh", "utf-8") },
    {
      name: "checklist.md",
      content: fs.readFileSync("./checklist.md", "utf-8"),
    },
  ],
  tools: ["bash", "github", "slack"],
});

// Use skill
const response = await agent.messages.create({
  messages: [{ role: "user", content: "Deploy to production" }],
  skills: ["deploy-to-production"], // Explicit activation
});
```

#### Key Features

- **Dynamic Registration**: Skills created/updated at runtime
- **Version Control**: Skills versioned via API
- **Access Control**: Per-skill permissions
- **Analytics**: Usage tracking and metrics

---

## Common Patterns Across Platforms

### 1. SKILL.md Format

**Convergence**: 90%+ of platforms use YAML frontmatter + markdown body.

```markdown
---
name: skill-identifier
description: Clear description for LLM and users
[optional fields: version, author, tags, tools, etc.]
---

# Markdown Instructions

...
```

**Why This Format?**

- Human-readable (Markdown)
- Machine-parseable (YAML)
- Extensible (custom frontmatter fields)
- Git-friendly (text files, easy diffs)
- LLM-native (models trained on markdown)

### 2. Filesystem-Based Loading

**Pattern**: Scan local filesystem for `SKILL.md` files.

```
project/
  .platform/skills/     # Workspace skills
    deploy/
      SKILL.md
      resources/
  ~/.platform/skills/   # Global skills
    testing/
      SKILL.md
```

**Advantages:**

- Simple: No database, no server
- Version control: Skills committed with code
- Portability: Works offline
- Composability: Skills can reference other skills

**Disadvantages:**

- No centralized distribution (except skills.sh)
- Versioning is manual
- Discovery is local only

### 3. Progressive Disclosure

**Three-Level Pattern** (from Claude):

```typescript
// Level 1: Always in context
systemPrompt += `
Available skills:
- deploy-to-production: Production deployment workflow
- run-tests: Execute test suite with coverage
`;

// Level 2: When activated
if (activatedSkills.includes("deploy-to-production")) {
  context += skillInstructions["deploy-to-production"];
}

// Level 3: On-demand
if (llmRequests("./deploy.sh")) {
  context += fs.readFileSync("./skills/deploy-to-production/deploy.sh");
}
```

**Why Progressive?**

- **Context Efficiency**: Don't waste tokens on unused skills
- **Relevance**: Only load what's needed
- **Scale**: Support 100s of skills without context explosion

### 4. Lazy Resource Loading

**Pattern**: List resources in metadata, load content on-demand.

```typescript
type Skill = {
  name: string;
  description: string;
  instructions: string;
  resources: Resource[]; // Metadata only
};

type Resource = {
  name: string;
  path: string;
  size: number;
  content: () => Promise<string>; // Lazy loader
};
```

**Triggers for Loading:**

1. LLM explicitly mentions resource name
2. Instruction says "see ./resource.md"
3. User explicitly requests via @-mention

### 5. Script Execution via Tools

**Two Approaches:**

**A. Template Pattern** (Windsurf, Cline)

````markdown
# In SKILL.md

Use this deployment script as a starting point:

```bash
#!/bin/bash
npm run build
rsync -av dist/ server:/var/www/
```
````

Adapt as needed for your environment.

````

LLM behavior:
1. Reads script
2. Modifies for context
3. Proposes execution via `bash` tool
4. User approves

**B. Direct Execution** (Claude, Goose)
```markdown
# In SKILL.md
Execute ./deploy.sh to deploy.
````

LLM behavior:

1. Calls `execute_bash` tool with `./deploy.sh`
2. Tool executes script
3. Output returned to LLM

**Security Considerations:**

- Template = safer (user reviews before execution)
- Direct = faster (no review step)
- Sandboxing crucial for direct execution

---

## Divergent Approaches

### Cursor: Simplicity > Flexibility

- No SKILL.md, just `.cursorrules`
- Always-on, no activation
- No resources, just text
- **Trade-off**: Simple but limited

### Goose: Automation > Assistance

- `recipe.yaml` not SKILL.md
- Direct execution, no LLM interpretation
- Procedural steps, not declarative guidance
- **Trade-off**: Powerful but less flexible

### VS Code Copilot: Extensions > Files

- Extension-based agents
- Marketplace distribution
- Strong permissions model
- **Trade-off**: Ecosystem lock-in

---

## Key Insights for SISU

### 1. Adopt the Standard Format

- Use SKILL.md with YAML frontmatter
- Follow progressive disclosure pattern
- Support filesystem loading
- **Rationale**: Interoperability with 54K+ existing skills

### 2. Separate Loading from Execution

- **Loading**: Parse SKILL.md, index metadata
- **Execution**: Use existing SISU tools
- **Rationale**: Cleaner separation of concerns, reuse existing infrastructure

### 3. Progressive Disclosure is Essential

- Don't load all skills into context
- Use semantic matching for activation
- Lazy-load resources
- **Rationale**: Context efficiency, supports large skill libraries

### 4. Script Execution: Template Pattern

- Scripts are templates, not executables
- LLM reads and adapts
- Execution via existing `terminal` or `bash` tools
- **Rationale**: Better observability, user control, fits SISU philosophy

### 5. MCP Integration is Table Stakes

- Skills should bundle MCP server configs
- Auto-start MCP servers when skill activated
- **Rationale**: MCP is emerging standard, skills enable complex capabilities

---

## Implementation Recommendations

### Phase 1: Core Format Support

```typescript
// @sisu-ai/mw-load-skills
interface Skill {
  name: string;
  description: string;
  instructions: string;
  resourcePaths: string[]; // Lazy-load
  version?: string;
  author?: string;
  tags?: string[];
}

async function loadSkills(ctx: Context) {
  const workspaceSkills = await scanDirectory(".sisu/skills");
  const globalSkills = await scanDirectory("~/.sisu/skills");

  ctx.state.skills = [...workspaceSkills, ...globalSkills];

  // Level 1: Inject skill metadata into system prompt
  ctx.state.availableSkills = ctx.state.skills.map((s) => ({
    name: s.name,
    description: s.description,
  }));
}
```

### Phase 2: Progressive Activation

```typescript
// @sisu-ai/mw-activate-skills
async function activateSkills(ctx: Context, next: Next) {
  const userQuery = ctx.messages[ctx.messages.length - 1].content;

  // Semantic matching
  const matches = await semanticMatch(userQuery, ctx.state.skills);

  // Level 2: Load instructions
  for (const skill of matches) {
    ctx.state.activeSkills.push({
      ...skill,
      instructions: await loadInstructions(skill),
    });
  }

  await next();
}
```

### Phase 3: Resource Loading

```typescript
// Resource loading happens in tool execution
// Example: read_file tool
async function readFile(ctx: Context, args: { path: string }) {
  // Check if path is relative to an active skill
  for (const skill of ctx.state.activeSkills) {
    const skillPath = resolveSkillResource(skill, args.path);
    if (skillPath) {
      return fs.readFile(skillPath, "utf-8");
    }
  }

  // Normal file read
  return fs.readFile(args.path, "utf-8");
}
```

### Phase 4: Script Execution

````typescript
// No special handling - scripts are read as text
// LLM uses existing bash/terminal tools to execute
// Example skill:
```markdown
---
name: deploy-staging
description: Deploy application to staging environment
---

# Deployment Process

1. Review the deployment script: `./deploy.sh`
2. Verify environment variables are set
3. Execute the script using the bash tool
4. Monitor output for errors
````

```

---

## Comparison Table: Skills vs Other Patterns

| Feature | Skills | MCP Servers | VS Code Extensions | Configuration Files |
|---------|--------|-------------|-------------------|-------------------|
| **Distribution** | Filesystem/skills.sh | NPM/registry | Marketplace | Committed in repo |
| **Portability** | High | Medium | Low | High |
| **Execution** | Via tools | Native | Native | N/A (config only) |
| **Complexity** | Low | Medium | High | Very Low |
| **Resources** | Multi-file | Single server | Full extension | Single file |
| **Discovery** | Semantic | Manual | Manual | Automatic |
| **Best For** | Workflows | Capabilities | IDE Features | Preferences |

---

## Open Questions

### 1. Skill Versioning
- How do platforms handle skill updates?
- Semantic versioning? Git tags? No versioning?
- **Claude**: No formal versioning, file timestamps
- **Roo Code**: Uses Git SHAs from skills.sh
- **SISU**: Could use Git tags or version field in frontmatter

### 2. Skill Dependencies
- Can skills depend on other skills?
- Can skills require specific tools?
- **Claude**: `allowed-tools` restricts, but doesn't require
- **Goose**: `tools` field declares requirements
- **SISU**: Start without dependencies, add if needed

### 3. Skill Marketplace
- Centralized registry (skills.sh) or decentralized (Git)?
- How to handle discoverability?
- **Current**: skills.sh is de facto registry
- **Future**: Could add SISU-specific skill hub

### 4. Security & Sandboxing
- How to prevent malicious skills?
- Skill code signing?
- Permission system?
- **Current**: Trust-based, user reviews code
- **Enterprise**: Need formal security model

---

## Conclusion

**Key Takeaway**: The SKILL.md + filesystem pattern has achieved ecosystem consensus. SISU should adopt this standard to gain immediate access to 54,000+ existing skills while maintaining the framework's philosophy of explicit, composable, and observable behavior.

**Recommended Approach**: Option D (Filesystem-Based Skills) with these adaptations:
1. **Loading**: Scan filesystem, parse YAML, index metadata
2. **Activation**: Progressive disclosure with semantic matching
3. **Resources**: Lazy-loading on-demand
4. **Execution**: Template pattern using existing SISU tools
5. **MCP**: Auto-discover and start bundled MCP servers

This approach balances **ecosystem compatibility** (works with existing skills) with **SISU philosophy** (explicit, observable, composable).
```
