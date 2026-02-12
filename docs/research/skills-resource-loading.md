# Agent Skills Resource Loading Patterns

**Created**: 2026-02-12  
**Status**: Research Phase  
**Related**: `docs/design-topics/dt-20260212-1100-agent-skills-support.md`, `docs/research/skills-cross-platform-analysis.md`

## Executive Summary

This document analyzes how platforms handle resource files within Agent Skills - including templates, data files, images, documentation, and other supporting materials. Key finding: **Lazy-loading with relative paths** is the universal pattern, with progressive disclosure determining when resources are loaded into LLM context.

### Key Findings

1. **Lazy Loading**: 100% of platforms delay resource loading until needed
2. **Relative Paths**: All platforms use skill-relative paths (e.g., `./template.md`)
3. **Size Limits**: Most platforms cap individual files at 100KB, total skill at 500KB
4. **File Types**: Text files (md, txt, json, yaml) are first-class; binaries (images, PDFs) have limited support
5. **Caching**: Resources cached in memory for session duration to avoid repeated disk I/O

---

## Resource Types & Use Cases

### 1. Template Files

**Purpose**: Boilerplate code, configuration templates, document structures

**Examples**:

```
skills/api-integration/
  SKILL.md
  templates/
    api-client.ts.template      # API client code
    auth-config.yaml.template   # Auth configuration
    .env.template              # Environment variables
```

**Loading Pattern**:

```markdown
# In SKILL.md

See `./templates/api-client.ts.template` for the client implementation.

Customize for your API:

- Replace {{API_BASE_URL}}
- Add authentication headers
- Implement error handling
```

**LLM Behavior**:

1. SKILL.md references template
2. LLM requests template content
3. Platform loads and injects into context
4. LLM fills placeholders, adapts code
5. LLM proposes writing to project

**Platform Support**: Universal (all platforms)

---

### 2. Reference Documentation

**Purpose**: API docs, schemas, specifications, guidelines

**Examples**:

```
skills/payment-integration/
  SKILL.md
  docs/
    stripe-api.md       # API documentation
    webhook-events.md   # Event types reference
    error-codes.md      # Error handling guide
```

**Loading Pattern**:

```markdown
# In SKILL.md

## Payment Integration Process

1. Review API documentation: `./docs/stripe-api.md`
2. Implement webhook handler (see `./docs/webhook-events.md`)
3. Handle errors according to `./docs/error-codes.md`
```

**LLM Behavior**:

- Loads docs on-demand when implementing features
- Uses docs to validate approach
- References docs when explaining to user

**Platform Support**: Universal

**Size Considerations**:

- Large API docs (>100KB) may be excluded
- Solution: Summarize or split into sections

---

### 3. Data Files & Examples

**Purpose**: Sample data, test fixtures, configuration examples

**Examples**:

```
skills/data-analysis/
  SKILL.md
  data/
    sample-dataset.csv     # Example dataset
    expected-output.json   # Expected analysis results
    test-cases.yaml        # Test scenarios
```

**Loading Pattern**:

```markdown
# In SKILL.md

## Data Analysis Workflow

1. Load dataset (see `./data/sample-dataset.csv` for format)
2. Apply transformations
3. Validate output matches `./data/expected-output.json`
```

**LLM Behavior**:

- Loads sample data to understand structure
- Uses expected output for validation
- Adapts to user's actual data

**Platform Support**: Universal for text data (CSV, JSON, YAML)

**Binary Data**:

- Images, PDFs, Excel files have limited support
- Most platforms can't load binary files into LLM context
- Workaround: Provide text descriptions

---

### 4. Scripts & Code

**Purpose**: Reference implementations, helper functions, utilities

**Examples**:

```
skills/deployment/
  SKILL.md
  scripts/
    deploy.sh          # Deployment script
    rollback.sh        # Rollback procedure
    health-check.py    # Health verification
```

**Loading Pattern**:
See **Script Execution Research** document for detailed analysis.

**Summary**:

- Scripts loaded as **text**, not executed directly
- LLM reads, understands, adapts
- Execution via existing tool infrastructure

**Platform Support**: Universal (template pattern)

---

### 5. Configuration Files

**Purpose**: Settings, preferences, environment configs

**Examples**:

```
skills/testing/
  SKILL.md
  configs/
    jest.config.js       # Test framework config
    tsconfig.json        # TypeScript config
    .prettierrc          # Code formatting
```

**Loading Pattern**:

```markdown
# In SKILL.md

## Test Setup

1. Copy test configuration: `./configs/jest.config.js`
2. Customize paths for your project
3. Add to project root
```

**LLM Behavior**:

- Loads config as reference
- Adapts paths and settings
- Writes customized config to project

**Platform Support**: Universal

---

### 6. Checklists & Procedures

**Purpose**: Step-by-step guides, verification checklists, SOPs

**Examples**:

```
skills/code-review/
  SKILL.md
  checklists/
    security-checklist.md    # Security review items
    performance-checklist.md # Performance review items
    style-checklist.md       # Code style review items
```

**Loading Pattern**:

```markdown
# In SKILL.md

## Code Review Process

Follow these checklists:

1. Security: `./checklists/security-checklist.md`
2. Performance: `./checklists/performance-checklist.md`
3. Style: `./checklists/style-checklist.md`
```

**LLM Behavior**:

- Loads checklist when starting review
- Works through items systematically
- Reports findings to user

**Platform Support**: Universal

---

### 7. MCP Server Configurations

**Purpose**: MCP server settings for extended capabilities

**Examples**:

```
skills/database-admin/
  SKILL.md
  mcp/
    postgres-server.json   # PostgreSQL MCP config
    redis-server.json      # Redis MCP config
```

**Loading Pattern**:

```json
// postgres-server.json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://localhost/mydb"
      ],
      "env": {
        "POSTGRES_PASSWORD": "${POSTGRES_PASSWORD}"
      }
    }
  }
}
```

**Platform Behavior**:

- Scans skill directory for MCP configs
- Auto-starts MCP servers when skill activated
- Makes tools available to LLM

**Platform Support**: Claude, Windsurf, Roo Code, Cline

---

## Loading Mechanisms

### Pattern 1: Reference-Based (Lazy)

**How It Works**:

```typescript
// Skill metadata includes resource list
type Skill = {
  name: string;
  description: string;
  instructions: string; // SKILL.md body
  resources: ResourceMetadata[]; // NOT full content
};

type ResourceMetadata = {
  name: string;
  path: string;
  size: number;
  type: "text" | "binary";
};

// Load content only when requested
async function loadResource(
  skill: Skill,
  resourceName: string,
): Promise<string> {
  const resource = skill.resources.find((r) => r.name === resourceName);
  if (!resource) throw new Error(`Resource not found: ${resourceName}`);

  // Check cache first
  const cacheKey = `${skill.name}:${resourceName}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  // Load from disk
  const content = await fs.readFile(resource.path, "utf-8");

  // Cache for session
  cache.set(cacheKey, content);

  return content;
}
```

**Triggers for Loading**:

1. **Explicit Reference**: SKILL.md says "see ./file.md"
2. **LLM Request**: LLM asks to read a file
3. **User Mention**: User says "use the template from the skill"

**Platforms Using**: Claude, Windsurf, Cline, Roo Code

---

### Pattern 2: Eager Loading (Anti-Pattern)

**How It Works**:

```typescript
// Load ALL resources when skill activated
async function activateSkill(skill: Skill) {
  for (const resource of skill.resources) {
    const content = await fs.readFile(resource.path, "utf-8");
    context.addResource({
      name: resource.name,
      content: content,
    });
  }
}
```

**Problems**:

- **Context Bloat**: Wastes tokens on unused files
- **Slow**: Loading all files takes time
- **Scaling**: Can't support skills with many resources

**Platforms Using**: None (universally avoided)

---

### Pattern 3: Hybrid (Smart Prefetch)

**How It Works**:

```typescript
// Load resources based on likelihood of use
async function activateSkill(skill: Skill, userQuery: string) {
  // Always load: Resources mentioned in SKILL.md
  const mentionedResources = extractResourceReferences(skill.instructions);
  for (const resource of mentionedResources) {
    await loadResource(skill, resource);
  }

  // Prefetch: Resources semantically related to query
  const relatedResources = await semanticMatch(userQuery, skill.resources);
  for (const resource of relatedResources.slice(0, 3)) {
    await loadResource(skill, resource); // Top 3 only
  }

  // Lazy load: Everything else
  // (Loaded on-demand when LLM requests)
}
```

**Advantages**:

- **Fast**: Commonly-used resources pre-loaded
- **Smart**: Semantic matching predicts needs
- **Efficient**: Doesn't waste context on unlikely files

**Platforms Using**: None yet (proposed optimization)

---

## Resource Discovery & Indexing

### Filesystem Scan

**Implementation**:

```typescript
async function discoverResources(
  skillDir: string,
): Promise<ResourceMetadata[]> {
  const resources: ResourceMetadata[] = [];

  async function scan(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath); // Recursive
      } else if (entry.isFile() && entry.name !== "SKILL.md") {
        const stat = await fs.stat(fullPath);
        const relativePath = path.relative(skillDir, fullPath);

        resources.push({
          name: entry.name,
          path: fullPath,
          relativePath: relativePath,
          size: stat.size,
          type: inferType(entry.name),
          mtime: stat.mtime,
        });
      }
    }
  }

  await scan(skillDir);
  return resources;
}

function inferType(filename: string): "text" | "binary" {
  const textExts = [
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".sh",
    ".py",
    ".js",
    ".ts",
  ];
  const ext = path.extname(filename);
  return textExts.includes(ext) ? "text" : "binary";
}
```

**Excluded Files**:

- `SKILL.md` (loaded separately as instructions)
- `.git/` directory
- `node_modules/` directory
- `.DS_Store`, `.gitignore`, etc.
- Files > 100KB (platform-dependent)

---

### Resource Metadata Storage

**In-Memory Index**:

```typescript
// After scanning, store metadata
type SkillIndex = {
  skills: Map<string, Skill>;
  resourceIndex: Map<string, ResourceMetadata>; // Global resource lookup
};

const index: SkillIndex = {
  skills: new Map(),
  resourceIndex: new Map(),
};

// Index resources for fast lookup
for (const skill of skills) {
  for (const resource of skill.resources) {
    const key = `${skill.name}:${resource.relativePath}`;
    index.resourceIndex.set(key, resource);
  }
}

// Fast lookup
function findResource(
  skillName: string,
  resourcePath: string,
): ResourceMetadata | null {
  const key = `${skillName}:${resourcePath}`;
  return index.resourceIndex.get(key) || null;
}
```

---

## Size Limits & Constraints

### Per-File Limits

| Platform | Max File Size | Action if Exceeded     |
| -------- | ------------- | ---------------------- |
| Claude   | 100KB         | Skip file, log warning |
| Windsurf | 100KB         | Skip file              |
| Cline    | 100KB         | Skip file              |
| Goose    | No limit      | Load entire file       |
| Roo Code | 100KB         | Skip file              |

**Rationale for 100KB Limit**:

- Typical markdown doc: 5-20KB
- Typical code file: 10-50KB
- 100KB = ~25,000 words = reasonable context chunk
- Prevents accidental loading of large files (logs, datasets)

**Handling Large Files**:

```markdown
# In SKILL.md

⚠️ Note: API documentation is 500KB.
Refer to official docs at https://api.example.com/docs
Or use this summary:

## API Endpoints

- POST /users - Create user
- GET /users/:id - Get user
  ...
```

---

### Per-Skill Limits

| Platform | Max Total Size      | Max Resources | Action if Exceeded  |
| -------- | ------------------- | ------------- | ------------------- |
| Claude   | 500KB               | No limit      | Load until size cap |
| Windsurf | 500KB               | No limit      | Load until size cap |
| Cline    | No documented limit | No limit      | -                   |
| Goose    | No limit            | No limit      | -                   |

**Enforcement**:

```typescript
async function loadSkillResources(skill: Skill): Promise<void> {
  let totalSize = 0;
  const maxSize = 500 * 1024; // 500KB

  for (const resource of skill.resources) {
    if (totalSize + resource.size > maxSize) {
      console.warn(
        `Skill ${skill.name} exceeds size limit. Skipping ${resource.name}`,
      );
      break;
    }

    await loadResource(skill, resource.name);
    totalSize += resource.size;
  }
}
```

---

## Caching Strategies

### Session-Scoped Cache

**Implementation**:

```typescript
class ResourceCache {
  private cache = new Map<string, { content: string; timestamp: number }>();

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Invalidate if older than 5 minutes (in case file changed)
    const age = Date.now() - entry.timestamp;
    if (age > 5 * 60 * 1000) {
      this.cache.delete(key);
      return null;
    }

    return entry.content;
  }

  set(key: string, content: string): void {
    this.cache.set(key, {
      content,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

**When to Invalidate**:

- Session ends
- File modified (via file watcher)
- Manual cache clear
- Memory pressure

---

### Persistent Cache (Not Common)

**Why Avoid?**:

- Skills change frequently during development
- Stale cache worse than no cache
- Session cache sufficient for most use cases

**When Useful**:

- Large, stable skills (e.g., API documentation)
- Read-only resources
- Shared across users (enterprise)

---

## File Type Handling

### Text Files (First-Class)

**Supported Extensions**:

```typescript
const TEXT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".bash",
  ".py",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".html",
  ".css",
  ".scss",
  ".xml",
  ".svg",
  ".csv",
  ".tsv",
  ".sql",
  ".env",
  ".conf",
  ".config",
];
```

**Loading**:

```typescript
async function loadTextFile(path: string): Promise<string> {
  return fs.readFile(path, "utf-8");
}
```

**LLM Context**:

```markdown
## Resource: deploy.sh (bash script)

#!/bin/bash
npm run build
rsync -av dist/ server:/var/www/

---
```

---

### Binary Files (Limited Support)

**Challenges**:

- Can't load into text-based LLM context
- Large file sizes (images, videos)
- Encoding issues

**Current Handling**:

```typescript
async function handleBinaryFile(resource: ResourceMetadata): Promise<void> {
  if (resource.type === "binary") {
    // Skip binary files
    console.warn(`Skipping binary file: ${resource.name}`);
    return;
  }
}
```

**Workarounds**:

1. **Convert to Text**: Extract text from PDFs, images (OCR)
2. **Describe in SKILL.md**: "See diagram.png for architecture"
3. **Use External Links**: Link to hosted images/docs

**Future Support** (Vision Models):

```typescript
// With multimodal LLMs
async function loadImage(path: string): Promise<ImageResource> {
  const buffer = await fs.readFile(path);
  return {
    type: "image",
    data: buffer.toString("base64"),
    mimeType: "image/png",
  };
}

// LLM can now "see" images
ctx.addResource({
  type: "image",
  content: await loadImage("./diagram.png"),
});
```

---

### Special Cases

#### MCP Server Configs

**Detection**:

```typescript
function isMCPConfig(resource: ResourceMetadata): boolean {
  return resource.path.includes("/mcp/") && resource.name.endsWith(".json");
}

async function loadMCPConfigs(skill: Skill): Promise<MCPConfig[]> {
  const mcpResources = skill.resources.filter(isMCPConfig);
  const configs = [];

  for (const resource of mcpResources) {
    const content = await fs.readFile(resource.path, "utf-8");
    const config = JSON.parse(content);
    configs.push(config);
  }

  return configs;
}
```

**Auto-Start**:

```typescript
async function activateSkillWithMCP(skill: Skill): Promise<void> {
  // Load MCP configs
  const mcpConfigs = await loadMCPConfigs(skill);

  // Start MCP servers
  for (const config of mcpConfigs) {
    await startMCPServer(config);
  }

  // Now activate skill
  await activateSkill(skill);
}
```

---

#### Environment Files

**Security Consideration**:

```typescript
function isSecretFile(resource: ResourceMetadata): boolean {
  const secretPatterns = [".env", "secrets", "credentials", "private-key"];
  return secretPatterns.some((pattern) => resource.name.includes(pattern));
}

async function loadResource(resource: ResourceMetadata): Promise<string> {
  if (isSecretFile(resource)) {
    // Never load secrets into LLM context
    return "[REDACTED: Secret file not loaded for security]";
  }

  return fs.readFile(resource.path, "utf-8");
}
```

**Templates vs Actual**:

```
✅ .env.template       → Safe to load (example values)
❌ .env                → Never load (actual secrets)
✅ secrets.example.yml → Safe
❌ secrets.yml         → Never load
```

---

## Path Resolution

### Relative Paths (Standard)

**In SKILL.md**:

```markdown
See `./templates/api-client.ts` for implementation.
```

**Resolution**:

```typescript
function resolveResourcePath(skillDir: string, relativePath: string): string {
  // Remove leading ./
  const cleanPath = relativePath.replace(/^\.\//, "");

  // Join with skill directory
  const fullPath = path.join(skillDir, cleanPath);

  // Verify path is within skill directory (security)
  if (!fullPath.startsWith(skillDir)) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
}
```

---

### Absolute Paths (Not Allowed)

**Security Risk**:

```markdown
❌ See `/etc/passwd` for user list
❌ See `~/secrets.txt` for credentials
```

**Validation**:

```typescript
function validateResourcePath(path: string): void {
  if (path.startsWith("/") || path.startsWith("~")) {
    throw new Error("Absolute paths not allowed in skills");
  }

  if (path.includes("../")) {
    throw new Error("Path traversal not allowed in skills");
  }
}
```

---

### Cross-Skill References (Future)

**Not yet supported, but proposed**:

```markdown
# In skill-a/SKILL.md

See `@skill-b/templates/helper.js` for utility functions.
```

**Resolution**:

```typescript
function resolveCrossSkillPath(path: string): string {
  const match = path.match(/^@([^/]+)\/(.+)$/);
  if (!match) return resolveLocalPath(path);

  const [, skillName, resourcePath] = match;
  const skill = findSkill(skillName);
  if (!skill) throw new Error(`Skill not found: ${skillName}`);

  return resolveResourcePath(skill.dir, resourcePath);
}
```

**Use Cases**:

- Shared utilities across skills
- Common templates
- Organizational best practices

**Challenges**:

- Dependency management
- Versioning
- Circular references

---

## Error Handling

### Missing Resource

```typescript
async function loadResource(skill: Skill, path: string): Promise<string> {
  try {
    const fullPath = resolveResourcePath(skill.dir, path);
    return await fs.readFile(fullPath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      // File not found
      throw new ResourceNotFoundError(
        `Resource not found in skill "${skill.name}": ${path}`,
      );
    }
    throw err;
  }
}
```

**LLM Handling**:

```typescript
try {
  const content = await loadResource(skill, "./missing.md");
} catch (err) {
  if (err instanceof ResourceNotFoundError) {
    // Tell LLM resource is missing
    ctx.addSystemMessage(
      `Warning: Resource ${path} referenced in skill but not found. ` +
        `Available resources: ${skill.resources.map((r) => r.name).join(", ")}`,
    );
  }
}
```

---

### File Too Large

```typescript
async function loadResource(resource: ResourceMetadata): Promise<string> {
  const maxSize = 100 * 1024; // 100KB

  if (resource.size > maxSize) {
    throw new ResourceTooLargeError(
      `Resource ${resource.name} is too large (${resource.size} bytes, max ${maxSize})`,
    );
  }

  return fs.readFile(resource.path, "utf-8");
}
```

**Graceful Degradation**:

```typescript
try {
  const content = await loadResource(resource);
} catch (err) {
  if (err instanceof ResourceTooLargeError) {
    // Load first 100KB only
    const fd = await fs.open(resource.path, "r");
    const buffer = Buffer.alloc(maxSize);
    await fs.read(fd, buffer, 0, maxSize, 0);
    await fs.close(fd);

    return buffer.toString("utf-8") + "\n\n[...truncated...]";
  }
}
```

---

### Corrupted File

```typescript
async function loadResource(resource: ResourceMetadata): Promise<string> {
  const content = await fs.readFile(resource.path, "utf-8");

  // Validate content
  if (resource.type === "json") {
    try {
      JSON.parse(content);
    } catch (err) {
      throw new CorruptedResourceError(
        `JSON resource ${resource.name} is invalid: ${err.message}`,
      );
    }
  }

  if (resource.type === "yaml") {
    try {
      yaml.parse(content);
    } catch (err) {
      throw new CorruptedResourceError(
        `YAML resource ${resource.name} is invalid: ${err.message}`,
      );
    }
  }

  return content;
}
```

---

## SISU Implementation Recommendations

### 1. Adopt Standard Patterns

**Lazy Loading**:

```typescript
// In @sisu-ai/mw-load-skills
interface Skill {
  name: string;
  description: string;
  instructions: string;
  resources: ResourceMetadata[]; // Metadata only, not content
}

// Load content on-demand
async function loadResourceContent(
  ctx: Context,
  skillName: string,
  resourcePath: string,
): Promise<string> {
  const skill = ctx.state.skills.get(skillName);
  if (!skill) throw new Error(`Skill not found: ${skillName}`);

  const fullPath = path.join(skill.dir, resourcePath);

  // Validate
  if (!fullPath.startsWith(skill.dir)) {
    throw new Error("Invalid resource path");
  }

  // Check cache
  const cacheKey = `${skillName}:${resourcePath}`;
  if (ctx.cache.has(cacheKey)) {
    return ctx.cache.get(cacheKey);
  }

  // Load from disk
  const content = await fs.readFile(fullPath, "utf-8");

  // Cache
  ctx.cache.set(cacheKey, content);

  return content;
}
```

---

### 2. Integrate with Existing Tools

**No new resource loader needed**. Use existing `read_file` tool:

```typescript
// Extend read_file tool to recognize skill resources
async function readFile(ctx: Context, args: { path: string }): Promise<string> {
  // Check if path is a skill resource
  for (const skill of ctx.state.activeSkills || []) {
    if (args.path.startsWith("./") || !args.path.startsWith("/")) {
      // Relative path - might be skill resource
      try {
        return await loadResourceContent(ctx, skill.name, args.path);
      } catch {
        // Not in this skill, try next
      }
    }
  }

  // Not a skill resource - normal file read
  return fs.readFile(args.path, "utf-8");
}
```

---

### 3. Progressive Disclosure

**Three Levels** (same as Claude):

```typescript
// Level 1: Skill metadata (always in context)
const skillSummary = skills.map((s) => ({
  name: s.name,
  description: s.description,
  resourceCount: s.resources.length,
}));

ctx.addSystemMessage(`
Available skills:
${JSON.stringify(skillSummary, null, 2)}
`);

// Level 2: Skill instructions (when activated)
if (activatedSkill) {
  ctx.addSystemMessage(`
Skill: ${activatedSkill.name}
Instructions:
${activatedSkill.instructions}

Available resources:
${activatedSkill.resources.map((r) => `- ${r.relativePath} (${r.size} bytes)`).join("\n")}
  `);
}

// Level 3: Resource content (on-demand)
// Loaded when LLM calls read_file or explicitly references
```

---

### 4. Size Limits & Constraints

```typescript
const CONFIG = {
  MAX_RESOURCE_SIZE: 100 * 1024, // 100KB per file
  MAX_SKILL_SIZE: 500 * 1024, // 500KB total per skill
  MAX_CACHE_SIZE: 10 * 1024 * 1024, // 10MB total cache
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
};

async function loadResource(resource: ResourceMetadata): Promise<string> {
  if (resource.size > CONFIG.MAX_RESOURCE_SIZE) {
    console.warn(
      `Resource ${resource.name} exceeds size limit, loading first 100KB`,
    );
    return loadPartialFile(resource.path, CONFIG.MAX_RESOURCE_SIZE);
  }

  return fs.readFile(resource.path, "utf-8");
}
```

---

### 5. Security Best Practices

```typescript
// Blacklist secret files
const SECRET_PATTERNS = [
  /\.env$/,
  /secrets\./,
  /credentials\./,
  /private[-_]?key/,
  /\.pem$/,
  /\.key$/,
];

function isSecretFile(filename: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(filename));
}

// Validate paths
function validateResourcePath(skillDir: string, resourcePath: string): void {
  // No absolute paths
  if (path.isAbsolute(resourcePath)) {
    throw new Error("Absolute paths not allowed");
  }

  // No path traversal
  const resolved = path.resolve(skillDir, resourcePath);
  if (!resolved.startsWith(skillDir)) {
    throw new Error("Path traversal detected");
  }

  // No secret files
  if (isSecretFile(path.basename(resourcePath))) {
    throw new Error("Secret files not allowed");
  }
}
```

---

## Conclusion

**Key Takeaway**: Resource loading in Agent Skills follows a consistent pattern across platforms: **lazy-load text files with relative paths**, respecting size limits and caching for performance.

**Recommended Approach for SISU**:

1. **Lazy Loading**: Load resource metadata upfront, content on-demand
2. **Relative Paths**: Only allow skill-relative paths for security
3. **Size Limits**: 100KB per file, 500KB per skill
4. **Text Only**: Support text files, gracefully handle binaries
5. **Caching**: Session-scoped cache with 5min TTL
6. **Integration**: Extend existing `read_file` tool, don't create new loader
7. **Security**: Validate paths, exclude secret files

**No new middleware needed**. Resource loading integrated into existing tools (`read_file`) and skill activation logic.

**Implementation Complexity**: Low - standard filesystem operations with path validation and caching.
