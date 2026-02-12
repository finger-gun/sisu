# Skills Middleware Architecture for SISU

**Created**: 2026-02-12  
**Status**: Research Phase  
**Related**: `docs/design-topics/dt-20260212-1100-agent-skills-support.md`

## Executive Summary

This document proposes the middleware architecture for Agent Skills support in SISU Framework, evaluating options for composability, separation of concerns, and alignment with SISU's philosophy of explicit, observable, and composable behavior.

### Key Findings

1. **Separation of Concerns**: Skills functionality should be split across multiple focused middleware packages
2. **Composability**: Each middleware should be independently useful and optional
3. **Integration**: Extend existing tools rather than creating parallel systems
4. **Progressive Disclosure**: Activation should be separate from loading

### Recommended Architecture

**Three-Package Approach**:

- `@sisu-ai/mw-load-skills` - Discover and index skills
- `@sisu-ai/mw-activate-skills` - Progressive disclosure and context injection
- Extend existing tools - No new package needed for resource loading or execution

---

## Architecture Options

### Option A: Single Monolithic Middleware

**Structure**:

```
@sisu-ai/mw-skills/
  src/
    index.ts           # Main middleware
    loader.ts          # Skill discovery
    activator.ts       # Activation logic
    resources.ts       # Resource loading
    types.ts           # Type definitions
```

**Implementation**:

```typescript
// Single middleware does everything
export function skills(config?: SkillsConfig): Middleware {
  return async (ctx, next) => {
    // 1. Load skills on first request
    if (!ctx.state.skills) {
      ctx.state.skills = await loadAllSkills(config);
    }

    // 2. Activate relevant skills
    const activated = await activateSkills(ctx, ctx.messages);

    // 3. Inject into context
    injectSkillsIntoContext(ctx, activated);

    // 4. Handle resource requests during execution
    ctx.on("tool-call", handleResourceRequests);

    await next();
  };
}
```

**Usage**:

```typescript
const agent = sisu({
  model: "gpt-4",
  middleware: [
    skills({
      workspaceDir: "./.sisu/skills",
      globalDir: "~/.sisu/skills",
      maxFileSize: 100 * 1024,
    }),
  ],
});
```

**Advantages**:

- Simple: One package to install
- Easy to use: Single configuration point
- Self-contained: All logic in one place

**Disadvantages**:

- ❌ **Violates Separation of Concerns**: Loading, activation, and resources mixed
- ❌ **Not Composable**: Can't use parts independently
- ❌ **Hard to Test**: Complex interactions in single middleware
- ❌ **Inflexible**: Can't replace/extend specific parts

**Verdict**: ❌ Does not align with SISU philosophy

---

### Option B: Separate Middleware Packages

**Structure**:

```
packages/middleware/
  load-skills/                    # Discovery & indexing
    src/
      index.ts
      loader.ts
      scanner.ts
      types.ts

  activate-skills/                # Progressive disclosure
    src/
      index.ts
      activator.ts
      semantic-match.ts
      types.ts

  execute-skills/                 # Script execution
    src/
      index.ts
      executor.ts
      sandbox.ts
      types.ts
```

**Implementation**:

```typescript
// @sisu-ai/mw-load-skills
export function loadSkills(config?: LoadSkillsConfig): Middleware {
  return async (ctx, next) => {
    // Load skills into ctx.state.skills
    ctx.state.skills = await discoverAndIndexSkills(config);
    await next();
  };
}

// @sisu-ai/mw-activate-skills
export function activateSkills(config?: ActivateSkillsConfig): Middleware {
  return async (ctx, next) => {
    // Requires: ctx.state.skills (from load-skills)
    const activated = await selectRelevantSkills(ctx);
    ctx.state.activeSkills = activated;

    // Inject into system prompt
    injectSkillContext(ctx, activated);

    await next();
  };
}

// @sisu-ai/mw-execute-skills
export function executeSkills(): Middleware {
  return async (ctx, next) => {
    // Intercept tool calls to handle skill resources
    ctx.on("tool-call:read_file", handleSkillResources);
    await next();
  };
}
```

**Usage**:

```typescript
const agent = sisu({
  model: "gpt-4",
  middleware: [
    loadSkills({ dirs: [".sisu/skills", "~/.sisu/skills"] }),
    activateSkills({ maxActive: 3 }),
    executeSkills(),
  ],
});
```

**Advantages**:

- ✅ **Separation of Concerns**: Each package has single responsibility
- ✅ **Composable**: Use only what you need
- ✅ **Testable**: Isolated unit tests per package
- ✅ **Extensible**: Easy to replace or extend parts

**Disadvantages**:

- More packages to install (3 vs 1)
- More configuration points
- Slightly more complex setup

**Verdict**: ✅ Aligns with SISU philosophy

---

### Option C: Hybrid (Recommended)

**Structure**:

```
packages/middleware/
  load-skills/              # Core: Discovery & indexing
    src/
      index.ts
      loader.ts
      scanner.ts
      types.ts

  activate-skills/          # Core: Progressive disclosure
    src/
      index.ts
      activator.ts
      semantic-match.ts
      types.ts

# NO execute-skills package - extend existing tools instead

packages/tools/
  read-file/
    src/
      index.ts
      skill-integration.ts  # Added: Handle skill resources

  bash/
    src/
      index.ts
      # No changes - skills provide scripts as text
```

**Rationale**:

- **Loading** and **activation** are skill-specific → new middleware
- **Resource reading** is just file I/O → extend existing `read_file` tool
- **Script execution** uses existing tools → no new package needed

**Implementation**:

```typescript
// @sisu-ai/mw-load-skills (new)
export function loadSkills(config: LoadConfig): Middleware {
  return async (ctx, next) => {
    const skills = await scanDirectories(config.dirs);
    ctx.state.skills = indexSkills(skills);
    await next();
  };
}

// @sisu-ai/mw-activate-skills (new)
export function activateSkills(config: ActivateConfig): Middleware {
  return async (ctx, next) => {
    const userQuery = getLastUserMessage(ctx);
    const matches = await semanticMatch(userQuery, ctx.state.skills);

    ctx.state.activeSkills = matches.slice(0, config.maxActive || 3);
    injectSkillsIntoPrompt(ctx, ctx.state.activeSkills);

    await next();
  };
}

// @sisu-ai/tool-read-file (extended)
export function readFile(schema: ReadFileSchema): Tool {
  return {
    name: "read_file",
    schema,
    handler: async (ctx, args) => {
      // NEW: Check if path is a skill resource
      const skillResource = tryResolveSkillResource(ctx, args.path);
      if (skillResource) {
        return loadSkillResource(skillResource);
      }

      // Existing: Normal file read
      return fs.readFile(args.path, "utf-8");
    },
  };
}

// @sisu-ai/tool-bash (no changes)
// Skills provide scripts as text, LLM calls bash tool to execute
```

**Usage**:

```typescript
const agent = sisu({
  model: "gpt-4",
  middleware: [
    loadSkills({ dirs: [".sisu/skills", "~/.sisu/skills"] }),
    activateSkills({ strategy: "semantic", maxActive: 3 }),
  ],
  tools: [
    readFile({ maxSize: 100 * 1024 }), // Automatically handles skill resources
    bash(), // Works with skills out of the box
  ],
});
```

**Advantages**:

- ✅ **Minimal New Code**: Only 2 new packages
- ✅ **Leverages Existing Infrastructure**: Reuses tools
- ✅ **Clean Separation**: Skills ≠ execution
- ✅ **Composable**: Each piece independently useful
- ✅ **SISU Philosophy**: Explicit, observable, composable

**Disadvantages**:

- None significant

**Verdict**: ✅✅ **RECOMMENDED**

---

## Detailed Design: Option C

### Package 1: `@sisu-ai/mw-load-skills`

**Purpose**: Discover, parse, and index skills from filesystem.

**Public API**:

```typescript
import type { Middleware, Context } from "@sisu-ai/core";

export interface LoadSkillsConfig {
  /** Directories to scan for skills */
  dirs?: string[];

  /** Max file size to load (bytes) */
  maxFileSize?: number;

  /** Max total skill size (bytes) */
  maxSkillSize?: number;

  /** File extensions to include */
  textExtensions?: string[];

  /** Enable file watching for hot reload */
  watch?: boolean;
}

export interface Skill {
  /** Unique identifier */
  name: string;

  /** Description for LLM and users */
  description: string;

  /** Full instructions (SKILL.md body) */
  instructions: string;

  /** Skill directory path */
  dir: string;

  /** Resource files (metadata only) */
  resources: ResourceMetadata[];

  /** Optional metadata */
  version?: string;
  author?: string;
  tags?: string[];
  allowedTools?: string[];
}

export interface ResourceMetadata {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  type: "text" | "binary";
  mtime: Date;
}

export function loadSkills(config?: LoadSkillsConfig): Middleware;
```

**Context State**:

```typescript
declare module "@sisu-ai/core" {
  interface Context {
    state: {
      /** Indexed skills (all discovered) */
      skills?: Map<string, Skill>;

      /** Skills by tag */
      skillsByTag?: Map<string, Skill[]>;
    };
  }
}
```

**Implementation Sketch**:

```typescript
export function loadSkills(config: LoadSkillsConfig = {}): Middleware {
  const {
    dirs = ['./.sisu/skills', path.join(os.homedir(), '.sisu/skills')],
    maxFileSize = 100 * 1024,
    maxSkillSize = 500 * 1024,
    textExtensions = ['.md', '.txt', '.json', '.yaml', ...],
    watch = false
  } = config;

  let loadedSkills: Map<string, Skill> | null = null;

  return async (ctx, next) => {
    // Load once per agent instance
    if (!loadedSkills) {
      loadedSkills = new Map();

      for (const dir of dirs) {
        const expandedDir = expandPath(dir);
        if (!await fs.exists(expandedDir)) continue;

        const skills = await scanSkillsDirectory(expandedDir, {
          maxFileSize,
          maxSkillSize,
          textExtensions
        });

        for (const skill of skills) {
          loadedSkills.set(skill.name, skill);
        }
      }

      if (watch) {
        setupFileWatcher(dirs, loadedSkills);
      }
    }

    // Attach to context
    ctx.state.skills = loadedSkills;
    ctx.state.skillsByTag = indexByTags(loadedSkills);

    await next();
  };
}

async function scanSkillsDirectory(
  dir: string,
  config: ScanConfig
): Promise<Skill[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(dir, entry.name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!await fs.exists(skillMdPath)) continue;

    try {
      const skill = await parseSkill(skillDir, skillMdPath, config);
      skills.push(skill);
    } catch (err) {
      ctx.log.warn(`Failed to parse skill in ${skillDir}: ${err.message}`);
    }
  }

  return skills;
}

async function parseSkill(
  skillDir: string,
  skillMdPath: string,
  config: ScanConfig
): Promise<Skill> {
  // Parse SKILL.md
  const content = await fs.readFile(skillMdPath, 'utf-8');
  const { data: frontmatter, content: instructions } = matter(content);

  // Validate required fields
  if (!frontmatter.name || !frontmatter.description) {
    throw new Error('SKILL.md missing required fields: name, description');
  }

  // Discover resources
  const resources = await discoverResources(skillDir, config);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    instructions,
    dir: skillDir,
    resources,
    version: frontmatter.version,
    author: frontmatter.author,
    tags: frontmatter.tags || [],
    allowedTools: frontmatter['allowed-tools']
  };
}

async function discoverResources(
  skillDir: string,
  config: ScanConfig
): Promise<ResourceMetadata[]> {
  const resources: ResourceMetadata[] = [];

  async function scan(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name !== 'SKILL.md') {
        const stat = await fs.stat(fullPath);

        if (stat.size > config.maxFileSize) continue;

        const relativePath = path.relative(skillDir, fullPath);
        const ext = path.extname(entry.name);

        resources.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          size: stat.size,
          type: config.textExtensions.includes(ext) ? 'text' : 'binary',
          mtime: stat.mtime
        });
      }
    }
  }

  await scan(skillDir);
  return resources;
}
```

**Testing**:

```typescript
describe("loadSkills", () => {
  it("discovers skills from directory", async () => {
    const ctx = createContext();
    const middleware = loadSkills({ dirs: ["./test/fixtures/skills"] });

    await middleware(ctx, async () => {});

    expect(ctx.state.skills).toBeDefined();
    expect(ctx.state.skills.size).toBe(2);
    expect(ctx.state.skills.has("deploy-staging")).toBe(true);
  });

  it("parses SKILL.md frontmatter", async () => {
    const ctx = createContext();
    const middleware = loadSkills({ dirs: ["./test/fixtures/skills"] });

    await middleware(ctx, async () => {});

    const skill = ctx.state.skills.get("deploy-staging");
    expect(skill.name).toBe("deploy-staging");
    expect(skill.description).toContain("Deploy to staging");
    expect(skill.resources.length).toBeGreaterThan(0);
  });

  it("skips files larger than maxFileSize", async () => {
    const ctx = createContext();
    const middleware = loadSkills({
      dirs: ["./test/fixtures/skills"],
      maxFileSize: 1024, // Very small
    });

    await middleware(ctx, async () => {});

    const skill = ctx.state.skills.get("deploy-staging");
    const largeFiles = skill.resources.filter((r) => r.size > 1024);
    expect(largeFiles.length).toBe(0);
  });
});
```

---

### Package 2: `@sisu-ai/mw-activate-skills`

**Purpose**: Select relevant skills and inject into context via progressive disclosure.

**Public API**:

```typescript
export interface ActivateSkillsConfig {
  /** Activation strategy */
  strategy?: "semantic" | "explicit" | "always";

  /** Max number of skills to activate simultaneously */
  maxActive?: number;

  /** Similarity threshold for semantic matching (0-1) */
  threshold?: number;

  /** Embedding model for semantic search */
  embedModel?: string;
}

export function activateSkills(config?: ActivateSkillsConfig): Middleware;
```

**Context State**:

```typescript
declare module "@sisu-ai/core" {
  interface Context {
    state: {
      /** Currently active skills */
      activeSkills?: Skill[];

      /** Skill activation scores */
      skillScores?: Map<string, number>;
    };
  }
}
```

**Implementation Sketch**:

```typescript
export function activateSkills(config: ActivateSkillsConfig = {}): Middleware {
  const {
    strategy = "semantic",
    maxActive = 3,
    threshold = 0.7,
    embedModel = "text-embedding-ada-002",
  } = config;

  return async (ctx, next) => {
    // Require skills to be loaded
    if (!ctx.state.skills || ctx.state.skills.size === 0) {
      ctx.log.warn("No skills loaded. Did you add loadSkills middleware?");
      await next();
      return;
    }

    // Select skills based on strategy
    let activated: Skill[] = [];

    if (strategy === "semantic") {
      activated = await selectBySemantic(ctx, {
        threshold,
        maxActive,
        embedModel,
      });
    } else if (strategy === "explicit") {
      activated = await selectByMention(ctx);
    } else if (strategy === "always") {
      activated = Array.from(ctx.state.skills.values()).slice(0, maxActive);
    }

    ctx.state.activeSkills = activated;

    // Inject into context (progressive disclosure level 1)
    injectSkillSummaries(ctx, activated);

    await next();
  };
}

async function selectBySemantic(
  ctx: Context,
  config: SemanticConfig,
): Promise<Skill[]> {
  const userQuery = getLastUserMessage(ctx);
  if (!userQuery) return [];

  // Embed user query
  const queryEmbedding = await embed(userQuery, config.embedModel);

  // Compute similarity with each skill
  const scores: Array<{ skill: Skill; score: number }> = [];

  for (const skill of ctx.state.skills.values()) {
    // Embed skill description (cached)
    const skillEmbedding = await embed(skill.description, config.embedModel);

    // Cosine similarity
    const score = cosineSimilarity(queryEmbedding, skillEmbedding);

    if (score >= config.threshold) {
      scores.push({ skill, score });
    }
  }

  // Sort by score, take top N
  scores.sort((a, b) => b.score - a.score);

  // Store scores for observability
  ctx.state.skillScores = new Map(
    scores.map(({ skill, score }) => [skill.name, score]),
  );

  return scores.slice(0, config.maxActive).map((s) => s.skill);
}

async function selectByMention(ctx: Context): Promise<Skill[]> {
  const userMessage = getLastUserMessage(ctx);
  if (!userMessage) return [];

  // Find @skill-name mentions
  const mentions = userMessage.match(/@([a-z0-9-]+)/g) || [];
  const skillNames = mentions.map((m) => m.slice(1)); // Remove @

  const activated: Skill[] = [];

  for (const name of skillNames) {
    const skill = ctx.state.skills.get(name);
    if (skill) {
      activated.push(skill);
    } else {
      ctx.log.warn(`Skill not found: ${name}`);
    }
  }

  return activated;
}

function injectSkillSummaries(ctx: Context, skills: Skill[]): void {
  if (skills.length === 0) return;

  const summary = `
You have access to the following skills:

${skills
  .map(
    (skill) => `
**${skill.name}**
${skill.description}

To use this skill, you can:
- Reference resources: Read files from the skill directory
- Follow instructions: The skill provides step-by-step guidance

Available resources:
${skill.resources.map((r) => `- ${r.relativePath} (${r.type}, ${r.size} bytes)`).join("\n")}
`,
  )
  .join("\n---\n")}

To load a skill's instructions, ask me about it or reference its resources.
`.trim();

  // Inject as system message (progressive disclosure level 1)
  ctx.messages.unshift({
    role: "system",
    content: summary,
  });

  ctx.log.info(
    `Activated ${skills.length} skills:`,
    skills.map((s) => s.name),
  );
}

function getLastUserMessage(ctx: Context): string | null {
  const userMessages = ctx.messages.filter((m) => m.role === "user");
  return userMessages.length > 0
    ? userMessages[userMessages.length - 1].content
    : null;
}
```

**Progressive Disclosure Levels**:

```typescript
// Level 1: Summaries (injected by activateSkills)
injectSkillSummaries(ctx, activeSkills);

// Level 2: Full instructions (when LLM asks about skill)
if (llmMentionsSkill(response, skill)) {
  ctx.messages.push({
    role: "assistant",
    content: `I'll use the ${skill.name} skill.`,
  });
  ctx.messages.push({
    role: "system",
    content: `
Skill: ${skill.name}
Instructions:
${skill.instructions}
    `,
  });
}

// Level 3: Resources (when LLM requests file)
// Handled by extended read_file tool (see below)
```

**Testing**:

```typescript
describe("activateSkills", () => {
  it("activates skills based on semantic similarity", async () => {
    const ctx = createContext({
      messages: [{ role: "user", content: "Deploy to staging please" }],
      state: {
        skills: new Map([
          [
            "deploy-staging",
            createSkill({
              name: "deploy-staging",
              description: "Deploy to staging",
            }),
          ],
          [
            "run-tests",
            createSkill({ name: "run-tests", description: "Run test suite" }),
          ],
        ]),
      },
    });

    const middleware = activateSkills({ strategy: "semantic" });
    await middleware(ctx, async () => {});

    expect(ctx.state.activeSkills).toHaveLength(1);
    expect(ctx.state.activeSkills[0].name).toBe("deploy-staging");
  });

  it("activates multiple skills if above threshold", async () => {
    const ctx = createContext({
      messages: [{ role: "user", content: "Deploy and test the app" }],
      state: {
        skills: new Map([
          ["deploy", createSkill({ description: "Deploy application" })],
          ["test", createSkill({ description: "Run tests" })],
          ["unrelated", createSkill({ description: "Something else" })],
        ]),
      },
    });

    const middleware = activateSkills({ strategy: "semantic", maxActive: 2 });
    await middleware(ctx, async () => {});

    expect(ctx.state.activeSkills.length).toBeLessThanOrEqual(2);
  });

  it("activates skills by @-mention", async () => {
    const ctx = createContext({
      messages: [{ role: "user", content: "Use @deploy-staging to deploy" }],
      state: {
        skills: new Map([
          ["deploy-staging", createSkill({ name: "deploy-staging" })],
          ["deploy-prod", createSkill({ name: "deploy-prod" })],
        ]),
      },
    });

    const middleware = activateSkills({ strategy: "explicit" });
    await middleware(ctx, async () => {});

    expect(ctx.state.activeSkills).toHaveLength(1);
    expect(ctx.state.activeSkills[0].name).toBe("deploy-staging");
  });
});
```

---

### Extended Tool: `@sisu-ai/tool-read-file`

**Purpose**: Extend existing read_file tool to handle skill resources.

**Changes**:

```typescript
// BEFORE (existing)
export function readFile(schema: z.ZodSchema): Tool {
  return {
    name: "read_file",
    schema,
    handler: async (ctx, args) => {
      return fs.readFile(args.path, "utf-8");
    },
  };
}

// AFTER (with skill support)
export function readFile(schema: z.ZodSchema): Tool {
  return {
    name: "read_file",
    schema,
    handler: async (ctx, args) => {
      // NEW: Check if path refers to a skill resource
      if (ctx.state.activeSkills) {
        const skillResource = tryResolveSkillResource(ctx, args.path);
        if (skillResource) {
          ctx.log.debug(`Loading skill resource: ${skillResource.path}`);
          return loadSkillResource(ctx, skillResource);
        }
      }

      // Existing: Normal file read
      return fs.readFile(args.path, "utf-8");
    },
  };
}

function tryResolveSkillResource(
  ctx: Context,
  requestedPath: string,
): ResourceMetadata | null {
  if (!ctx.state.activeSkills) return null;

  // Try each active skill
  for (const skill of ctx.state.activeSkills) {
    // Remove leading ./ if present
    const cleanPath = requestedPath.replace(/^\.\//, "");

    // Find matching resource
    const resource = skill.resources.find(
      (r) => r.relativePath === cleanPath || r.name === cleanPath,
    );

    if (resource) return resource;
  }

  return null;
}

async function loadSkillResource(
  ctx: Context,
  resource: ResourceMetadata,
): Promise<string> {
  // Check cache
  const cacheKey = `skill:${resource.path}`;
  const cached = ctx.cache?.get(cacheKey);
  if (cached) return cached;

  // Load from disk
  const content = await fs.readFile(resource.path, "utf-8");

  // Cache for session
  ctx.cache?.set(cacheKey, content, { ttl: 5 * 60 * 1000 });

  return content;
}
```

**No API Changes**: Existing code using `read_file` automatically gains skill support.

---

### Tool: `@sisu-ai/tool-bash`

**No Changes Needed**: Skills provide scripts as text, LLM calls bash tool.

**Example Flow**:

```
1. Skill activated with deploy.sh resource
2. SKILL.md says: "See ./deploy.sh for deployment script"
3. LLM calls: read_file({ path: "./deploy.sh" })
4. Tool loads skill resource (script content)
5. LLM reads script, understands it
6. LLM proposes: bash({ command: "npm run build && rsync..." })
7. User approves
8. Tool executes command
```

**Why This Works**:

- Scripts are **reference implementations**, not executables
- LLM **adapts** script to context
- Existing bash tool **executes** adapted commands
- User **reviews** and **approves** before execution
- **Observable**, **explicit**, **composable** ✅

---

## Usage Examples

### Basic Usage

```typescript
import { sisu } from "@sisu-ai/core";
import { loadSkills, activateSkills } from "@sisu-ai/skills";
import { readFile, bash } from "@sisu-ai/tools";

const agent = sisu({
  model: "gpt-4",
  middleware: [
    loadSkills(), // Defaults: .sisu/skills, ~/.sisu/skills
    activateSkills(), // Defaults: semantic matching, max 3
  ],
  tools: [readFile(), bash()],
});

await agent.run("Deploy the app to staging");
// Skills automatically discovered, activated, and used
```

---

### Custom Configuration

```typescript
const agent = sisu({
  model: "gpt-4",
  middleware: [
    loadSkills({
      dirs: [
        "./skills", // Project skills
        "~/.company/skills", // Company-wide skills
        "~/.sisu/skills", // Personal skills
      ],
      maxFileSize: 200 * 1024, // 200KB per file
      watch: true, // Hot reload skills during development
    }),
    activateSkills({
      strategy: "semantic",
      maxActive: 5, // Activate up to 5 skills
      threshold: 0.6, // Lower threshold = more activations
    }),
  ],
  tools: [readFile(), bash()],
});
```

---

### Explicit Skill Activation

```typescript
// User explicitly activates via @-mention
const agent = sisu({
  middleware: [
    loadSkills(),
    activateSkills({ strategy: "explicit" }), // Only @-mentions
  ],
  tools: [readFile(), bash()],
});

await agent.run("@deploy-staging Deploy the latest build");
// Only deploy-staging skill activated
```

---

### Always-On Skills

```typescript
const agent = sisu({
  middleware: [
    loadSkills(),
    activateSkills({ strategy: "always", maxActive: 10 }),
  ],
  tools: [readFile(), bash()],
});

// All skills (up to 10) always active
// Useful for specialized agents with few, essential skills
```

---

### Skills Without Semantic Matching (Lightweight)

```typescript
// Don't need embeddings? Use explicit-only
const agent = sisu({
  middleware: [loadSkills(), activateSkills({ strategy: "explicit" })],
  tools: [readFile(), bash()],
});

// Skills activated only via @skill-name mentions
// No embedding model calls → faster, cheaper
```

---

## Composability Examples

### Using Only loadSkills (Custom Activation)

```typescript
const agent = sisu({
  middleware: [
    loadSkills(),

    // Custom activation logic
    async (ctx, next) => {
      // Activate skills based on custom rules
      if (ctx.messages[0].content.includes("emergency")) {
        ctx.state.activeSkills = [ctx.state.skills.get("rollback-deployment")];
      }
      await next();
    },
  ],
  tools: [readFile(), bash()],
});
```

---

### Skills + RAG (Hybrid Context)

```typescript
const agent = sisu({
  middleware: [
    loadSkills(), // Load skills
    rag({
      // Load documents
      vectorStore: chromaClient,
      collection: "docs",
    }),
    activateSkills(), // Activate skills

    // Custom: Combine skills + RAG results
    async (ctx, next) => {
      // Active skills provide procedures
      // RAG provides reference docs
      // LLM gets both!
      await next();
    },
  ],
  tools: [readFile(), bash()],
});
```

---

### Skills + Guardrails (Safety First)

```typescript
const agent = sisu({
  middleware: [
    loadSkills(),
    activateSkills(),

    guardrails({
      // Ensure skills don't violate policies
      rules: [
        {
          condition: (ctx) =>
            ctx.state.activeSkills?.some((s) => s.name.includes("deploy")),
          check: async (ctx) => {
            // Require approval for deployment skills
            return await askUserApproval(
              ctx,
              "Deploy skill activated. Proceed?",
            );
          },
        },
      ],
    }),
  ],
  tools: [readFile(), bash()],
});
```

---

## Testing Strategy

### Unit Tests (Per Package)

```typescript
// @sisu-ai/mw-load-skills
describe("loadSkills", () => {
  it("discovers skills from directories");
  it("parses SKILL.md frontmatter");
  it("indexes resources");
  it("respects file size limits");
  it("handles missing directories gracefully");
  it("watches for file changes (when enabled)");
});

// @sisu-ai/mw-activate-skills
describe("activateSkills", () => {
  it("activates skills by semantic similarity");
  it("activates skills by @-mention");
  it("respects maxActive limit");
  it("respects similarity threshold");
  it("injects skill summaries into context");
  it("handles missing skills gracefully");
});

// @sisu-ai/tool-read-file (skill extensions)
describe("readFile with skills", () => {
  it("resolves skill resource paths");
  it("falls back to normal file read");
  it("caches skill resources");
  it("validates resource paths");
});
```

---

### Integration Tests (Full Stack)

```typescript
describe("Skills Integration", () => {
  it("end-to-end: load, activate, use skill", async () => {
    const agent = sisu({
      middleware: [
        loadSkills({ dirs: ["./test/fixtures/skills"] }),
        activateSkills({ strategy: "semantic" }),
      ],
      tools: [readFile(), bash()],
    });

    const result = await agent.run("Deploy to staging");

    expect(result).toContain("Deployment successful");
  });

  it("skill resources loaded correctly", async () => {
    const agent = sisu({
      middleware: [
        loadSkills({ dirs: ["./test/fixtures/skills"] }),
        activateSkills({ strategy: "always" }),
      ],
      tools: [readFile()],
    });

    // Spy on read_file calls
    const readFileSpy = vi.spyOn(fs, "readFile");

    await agent.run("Show me the deployment script");

    expect(readFileSpy).toHaveBeenCalledWith(
      expect.stringContaining("/skills/deploy-staging/deploy.sh"),
      "utf-8",
    );
  });

  it("multiple skills work together", async () => {
    // Test skills composing (e.g., deploy-staging uses run-tests)
  });

  it("skills work with other middleware (RAG, guardrails)", async () => {
    // Test middleware composition
  });
});
```

---

## Migration Path

### Phase 1: Core Packages (Week 1-2)

- Implement `@sisu-ai/mw-load-skills`
- Implement `@sisu-ai/mw-activate-skills`
- Add tests
- Write documentation

### Phase 2: Tool Integration (Week 2-3)

- Extend `@sisu-ai/tool-read-file` for skill resources
- Add tests
- Update examples

### Phase 3: Ecosystem (Week 3-4)

- Create example skills
- Integration with skills.sh
- User documentation
- Migration guide

### Phase 4: Polish (Week 4)

- Performance optimization
- Error handling improvements
- Observability (logging, tracing)
- Security hardening

---

## Open Questions

### 1. Should loadSkills be async initialization?

**Current**: Loads on first request (middleware)
**Alternative**: Load during agent construction

```typescript
// Alternative API
const agent = await sisu.create({
  model: "gpt-4",
  skills: {
    dirs: [".sisu/skills", "~/.sisu/skills"],
  },
});
```

**Pros**: Faster first request, errors surface early
**Cons**: Async agent creation, less flexible

**Decision**: Stick with middleware (more flexible, composable)

---

### 2. Caching Strategy?

**Current**: Session-scoped in-memory cache
**Alternative**: Persistent cache (Redis, filesystem)

**Decision**: Start with session cache, add persistent if needed

---

### 3. Embedding Model for Semantic Matching?

**Options**:

- Default: `text-embedding-ada-002` (OpenAI)
- Configurable: User provides model
- No embeddings: Keyword matching only

**Decision**: Configurable with OpenAI default

---

### 4. MCP Integration?

**Question**: Should skills middleware auto-start MCP servers?

**Proposal**:

```typescript
// Detect MCP configs in skill/mcp/ directory
// Auto-start when skill activated
const mcpServers = await discoverMCPServers(skill.dir);
for (const config of mcpServers) {
  await startMCPServer(config);
}
```

**Decision**: Yes, add in Phase 3

---

---

## CRITICAL UPDATE: Cline Implementation Analysis (2025-02-12)

**Source**: `docs/research/cline-implementation-analysis.md`

### Key Findings from Cline's Production Implementation

After analyzing Cline's 57.8K-star repository, we discovered their skills implementation is **significantly simpler** than our Option C proposal, and more importantly, **nearly dependency-free**.

#### Cline's Actual Architecture

```
src/shared/skills.ts                    - 2 interfaces (SkillMetadata, SkillContent)
src/core/.../skills.ts                  - Discovery, loading (~159 lines)
src/core/.../frontmatter.ts             - YAML parsing (~54 lines, uses js-yaml)
src/core/.../UseSkillToolHandler.ts     - Single tool handler (~103 lines)
src/core/prompts/.../skills.ts          - System prompt injection (~24 lines)
```

**Total**: ~340 lines of code for complete skills system

**Dependencies**: ONLY `js-yaml` (for YAML frontmatter parsing)

#### Critical Differences from Our Option C

| Feature               | Option C (Our Plan)                  | Cline (Production)                   | Winner          |
| --------------------- | ------------------------------------ | ------------------------------------ | --------------- |
| **Semantic matching** | Embeddings + vector similarity       | LLM-native (system prompt injection) | Cline (simpler) |
| **Activation**        | Separate middleware + matching logic | Single tool call (`use_skill`)       | Cline (simpler) |
| **Resource loading**  | Tool extension + special handling    | Existing file tools (no changes)     | Cline (simpler) |
| **Dependencies**      | OpenAI SDK (embeddings) + js-yaml    | js-yaml only                         | Cline (lighter) |
| **Packages**          | 2 middleware + tool extension        | Single tool + prompt injection       | Cline (simpler) |
| **Total code**        | ~1000+ lines estimated               | ~340 lines                           | Cline (less)    |

#### How Cline Does Activation WITHOUT Embeddings

```typescript
// System prompt includes ALL skill metadata
const skillsList = skills
  .map((skill) => `  - "${skill.name}": ${skill.description}`)
  .join("\n");

const systemPrompt = `SKILLS

Available skills:
${skillsList}

To use a skill:
1. Match the user's request to a skill based on its description
2. Call use_skill with the skill_name parameter set to the exact skill name
3. Follow the instructions returned by the tool`;
```

**Why this works**:

- Modern LLMs excel at semantic matching naturally
- Skill descriptions already optimized for LLM understanding
- Scales to ~100 skills before context window issues
- Zero cost, zero latency, zero dependencies for matching

**When to add embeddings**: Only if 100+ skills and context issues arise

#### Dependency-Free YAML Parsing for SISU

**Cline uses**: `js-yaml@4.1.1` (~10KB)

**SISU can use**: Custom simple parser (ZERO dependencies!)

```typescript
// Dependency-free frontmatter parser
// Handles only simple key: value pairs (sufficient for skills)
export function parseSimpleYamlFrontmatter(markdown: string): {
  data: Record<string, string>;
  body: string;
  hadFrontmatter: boolean;
  parseError?: string;
} {
  const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = markdown.match(regex);

  if (!match) return { data: {}, body: markdown, hadFrontmatter: false };

  const [, yamlContent, body] = match;
  const data: Record<string, string> = {};

  try {
    const lines = yamlContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) continue;

      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      // Remove quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      data[key] = value;
    }

    return { data, body, hadFrontmatter: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {},
      body: markdown,
      hadFrontmatter: true,
      parseError: message,
    };
  }
}
```

**Supports**: Simple key-value pairs (name, description, author, version, tags)  
**Doesn't support**: Nested objects, arrays, multiline strings  
**Sufficient**: Yes! Skills.sh and all platforms use simple frontmatter

**Dependencies**: `zod` (for validation) - ALREADY IN SISU ✅

---

### Revised Recommendation: Cline-Inspired Single Package

**Before Cline analysis**: Option C with 2 middleware packages

**After Cline analysis**: **Simpler single-package design**

```
@sisu-ai/mw-skills (SINGLE PACKAGE)
├─ src/
│  ├─ index.ts              # Main middleware (~50 lines)
│  ├─ discover.ts           # Filesystem scanning (~100 lines)
│  ├─ frontmatter.ts        # YAML parser - DEPENDENCY-FREE! (~50 lines)
│  ├─ tool-handler.ts       # use_skill tool (~80 lines)
│  ├─ types.ts              # TypeScript types (~30 lines)
│  └─ schemas.ts            # Zod schemas (~20 lines)
└─ package.json
    └─ dependencies: { "zod": "^3.x" }  # ONLY DEPENDENCY (already in SISU)
```

**Total**: ~330 lines (similar to Cline), **ZERO new dependencies**

#### Implementation

```typescript
// @sisu-ai/mw-skills/src/index.ts
import { discoverSkills } from "./discover";
import { useSkillTool } from "./tool-handler";

export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // Discovery (once per context)
    if (!ctx.skills) {
      ctx.skills = await discoverSkills(options.cwd);
    }

    // Add use_skill tool
    ctx.tools = ctx.tools || [];
    ctx.tools.push(useSkillTool(ctx.skills));

    // Inject into system prompt (LLM-native matching)
    if (ctx.skills.length > 0) {
      const skillsList = ctx.skills
        .map((s) => `  - "${s.name}": ${s.description}`)
        .join("\n");

      ctx.systemPrompt =
        (ctx.systemPrompt || "") +
        `\n\nSKILLS\n\nAvailable skills:\n${skillsList}\n\nUse the use_skill tool to activate a skill when the user's request matches a description.`;
    }

    await next();
  };
}
```

**Usage**:

```typescript
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const agent = sisu({
  model: "gpt-4",
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
});
```

**Benefits over Option C**:

- ✅ 1 package instead of 2+
- ✅ ZERO new dependencies (vs OpenAI SDK + js-yaml)
- ✅ ~330 lines instead of ~1000+
- ✅ LLM-native matching (simpler, faster, cheaper)
- ✅ No separate activation logic (happens via tool call)
- ✅ Reuses existing file tools (no extensions needed)
- ✅ Proven at scale (57.8K stars, production tested)

#### What We Learned

1. **Don't overcomplicate**: Semantic matching via embeddings is overkill for 0-100 skills
2. **Trust the LLM**: Modern models excel at natural language matching
3. **Dependency minimalism**: Custom YAML parser is sufficient for simple frontmatter
4. **Single responsibility**: Skills = instructions + metadata, not a complex system
5. **Tool integration**: Extend via context, not code (no tool modifications needed)

---

## Conclusion

**REVISED Recommended Architecture: Single-Package Cline-Inspired Design**

**Summary**:

1. **`@sisu-ai/mw-skills`**: Single package with discovery + tool handler
2. **No separate activation middleware**: LLM-native matching via system prompt
3. **No tool extensions**: Reuse existing `read_file` and `bash` tools as-is
4. **Custom YAML parser**: ZERO external dependencies (only Zod, already in SISU)

**Benefits**:

- ✅ **ZERO new dependencies** (Zod already in SISU)
- ✅ **~330 lines total** (proven at scale by Cline)
- ✅ **Single package** (1 import vs 2+)
- ✅ **LLM-native matching** (no embeddings API calls, faster, cheaper)
- ✅ **Simpler testing** (fewer integration points)
- ✅ **Composable and explicit** (still aligns with SISU philosophy)
- ✅ **Compatible with skills.sh ecosystem** (54K+ skills)
- ✅ **Observable and traceable** (all actions via tools)

**Why This is Better Than Option C**:

| Aspect                | Option C                | Cline-Inspired       | Winner           |
| --------------------- | ----------------------- | -------------------- | ---------------- |
| Packages              | 2 middleware + tool ext | 1 middleware         | Simpler ✅       |
| Dependencies          | openai SDK + js-yaml    | Zod only (have it)   | Zero-dep ✅      |
| Code lines            | ~1000+                  | ~330                 | Maintainable ✅  |
| Semantic matching     | Embeddings API          | LLM natural language | Cheaper ✅       |
| Activation complexity | Separate middleware     | Tool call            | Simpler ✅       |
| Tool modifications    | Extend read_file        | No changes           | Cleaner ✅       |
| Production proof      | Theory                  | 57.8K stars          | Battle-tested ✅ |

**REVISED Next Steps**:

1. Review and approve Cline-inspired architecture
2. Create `@sisu-ai/mw-skills` package stub
3. Implement dependency-free YAML parser (~50 lines)
4. Implement filesystem discovery (~100 lines)
5. Implement `use_skill` tool handler (~80 lines)
6. Add Zod schemas for validation (~20 lines)
7. Write comprehensive tests (≥80% coverage)
8. Create 5+ example skills (create-pr, explain-code, debug, etc.)
9. Document usage and skill authoring
10. Publish and gather community feedback

**Estimated Effort**: 2 weeks (vs 4-6 weeks for Option C)
