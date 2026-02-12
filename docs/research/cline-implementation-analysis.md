# Cline Skills Implementation Analysis

**Date**: 2025-02-12  
**Repository**: https://github.com/cline/cline (57.8K stars, TypeScript)  
**Context**: Research for SISU Agent Skills support with dependency-minimalism philosophy

## Executive Summary

Cline implements filesystem-based skills with a **remarkably simple architecture** that aligns well with SISU's philosophy. Key findings:

- ✅ **Zero custom dependencies** for core skills system (only `js-yaml` for YAML parsing)
- ✅ **No semantic matching** - relies on LLM natural language understanding
- ✅ **Pure filesystem scanning** - no database, no indexing, no embeddings
- ✅ **Progressive disclosure** - metadata loaded upfront, full content on-demand
- ✅ **Fail-open design** - gracefully handles missing/malformed skills
- ✅ **Simple tool integration** - single `use_skill` tool, leverages existing file tools

**Critical Insight for SISU**: We can build a **dependency-free skills system** using only Node.js built-ins + Zod (which we already have).

---

## Architecture Overview

### Core Components

```
src/shared/skills.ts
├─ SkillMetadata (interface)  - Name, description, path, source
└─ SkillContent (interface)   - Extends metadata + instructions

src/core/context/instructions/user-instructions/skills.ts
├─ discoverSkills()           - Scan global & project directories
├─ loadSkillMetadata()        - Parse SKILL.md frontmatter
├─ getAvailableSkills()       - Dedupe with override resolution
└─ getSkillContent()          - Load full instructions on-demand

src/core/context/instructions/user-instructions/frontmatter.ts
└─ parseYamlFrontmatter()     - Regex + js-yaml (ONLY EXTERNAL DEP)

src/core/task/tools/handlers/UseSkillToolHandler.ts
└─ execute()                  - Tool handler for use_skill

src/core/prompts/system-prompt/components/skills.ts
└─ getSkillsSection()         - Inject metadata into system prompt
```

### Data Flow

```
1. Startup: discoverSkills(cwd)
   ├─ Scan ~/.cline/skills/ (global)
   ├─ Scan .clinerules/skills/, .cline/skills/, .claude/skills/ (project)
   └─ Parse frontmatter (name + description ONLY)

2. System Prompt Generation
   ├─ Inject metadata list: "skill-name: description"
   ├─ Add use_skill tool definition
   └─ Rely on LLM to match user intent to skill description

3. Skill Activation (when LLM calls use_skill)
   ├─ Validate skill exists in available list
   ├─ Load full SKILL.md content
   ├─ Return instructions as tool result
   └─ LLM follows instructions directly
```

---

## Implementation Details

### 1. Filesystem Scanning

**File**: `src/core/context/instructions/user-instructions/skills.ts:21-48`

```typescript
async function scanSkillsDirectory(
  dirPath: string,
  source: "global" | "project",
): Promise<SkillMetadata[]> {
  // Uses Node.js fs.readdir() + fs.stat()
  // Filters to directories only
  // Calls loadSkillMetadata() for each subdirectory
  // Gracefully handles EACCES (permission denied)
}
```

**Key Behaviors**:

- **Synchronous at startup** - blocks until scan completes
- **No watchers** - doesn't monitor for changes (manual refresh via command)
- **Shallow scan** - only looks at immediate subdirectories, not recursive
- **Validates SKILL.md exists** - skips directories without SKILL.md

**Dependencies**: `fs/promises` (Node.js built-in), custom `fileExistsAtPath`/`isDirectory` utils

---

### 2. Frontmatter Parsing

**File**: `src/core/context/instructions/user-instructions/frontmatter.ts`

**ONLY EXTERNAL DEPENDENCY**: `js-yaml@4.1.1` (~10KB, 160M weekly downloads)

```typescript
export function parseYamlFrontmatter(markdown: string): FrontmatterParseResult {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) return { data: {}, body: markdown, hadFrontmatter: false };

  const [, yamlContent, body] = match;
  try {
    const data = yaml.load(yamlContent) as Record<string, unknown>;
    return { data, body, hadFrontmatter: true };
  } catch (error) {
    // Fail-open: return empty data, original body, + error flag
    return {
      data: {},
      body: markdown,
      hadFrontmatter: true,
      parseError: message,
    };
  }
}
```

**Fail-Open Design**:

- No frontmatter → Returns empty data + full markdown
- Invalid YAML → Returns empty data + full markdown + parseError flag
- Caller decides whether to log, skip, or continue

**Validation** (in `loadSkillMetadata`):

- Required fields: `name` (string), `description` (string)
- Name must match directory name exactly
- Missing fields → Logs warning, returns `null`, skill skipped

---

### 3. Skill Activation (No Semantic Matching!)

**File**: `src/core/prompts/system-prompt/components/skills.ts:6-23`

```typescript
export async function getSkillsSection(
  _variant: PromptVariant,
  context: SystemPromptContext,
): Promise<string | undefined> {
  const skills = context.skills;
  if (!skills || skills.length === 0) return undefined;

  const skillsList = skills
    .map((skill) => `  - "${skill.name}": ${skill.description}`)
    .join("\n");

  return `SKILLS

The following skills provide specialized instructions for specific tasks. 
When a user's request matches a skill description, use the use_skill tool 
to load and activate the skill.

Available skills:
${skillsList}

To use a skill:
1. Match the user's request to a skill based on its description
2. Call use_skill with the skill_name parameter set to the exact skill name
3. Follow the instructions returned by the tool`;
}
```

**Critical Insight**: **NO EMBEDDINGS, NO SIMILARITY SEARCH, NO RANKING**

- **Activation strategy**: Natural language matching by LLM
- **Metadata in context**: All skill metadata injected into system prompt
- **LLM decision**: Model reads descriptions, matches to user request
- **Tool call**: Model calls `use_skill(skill_name="exact-name")`

**Why this works**:

- Modern LLMs (Claude, GPT-4, etc.) excel at semantic understanding
- Skill descriptions are already optimized for LLM consumption
- No need for separate embedding model or vector database
- Scales to ~50-100 skills before context limits become an issue

**Scaling considerations**:

- **0-20 skills**: All metadata always in context (Cline's current approach)
- **20-100 skills**: All metadata in context, LLM filters effectively
- **100-500 skills**: May need chunking or embeddings (future optimization)
- **500+ skills**: Requires hierarchical categorization or search system

---

### 4. Tool Implementation

**File**: `src/core/task/tools/handlers/UseSkillToolHandler.ts:30-101`

**Tool Definition**:

```typescript
{
  name: "use_skill",
  description: "Load and activate a skill by name. Skills provide specialized
                instructions for specific tasks. Use this tool ONCE when a user's
                request matches one of the available skill descriptions shown in
                the SKILLS section of your system prompt. After activation, follow
                the skill's instructions directly - do not call use_skill again.",
  parameters: [
    {
      name: "skill_name",
      required: true,
      instruction: "The name of the skill to activate (must match exactly one
                    of the available skill names)"
    }
  ]
}
```

**Execution Flow**:

1. Validate `skill_name` parameter provided
2. Rediscover skills (lazy loading - happens on-demand!)
3. Apply toggle filters (user can disable skills via UI)
4. Find matching skill by name
5. Load full SKILL.md content (body after frontmatter)
6. Return formatted response:

   ```
   # Skill "{name}" is now active

   {full instructions}

   ---
   IMPORTANT: The skill is now loaded. Do NOT call use_skill again for this task.
   Simply follow the instructions above to complete the user's request. You may
   access other files in the skill directory at: {skill_dir}/
   ```

**Key Design Choices**:

- **Lazy rediscovery**: Skills re-scanned on activation (not cached at startup)
- **No caching**: Fresh scan every time (simple, avoids stale data)
- **Single-use tool**: LLM told explicitly not to call `use_skill` again
- **Resource access**: LLM informed of skill directory path for reading additional files
- **Telemetry**: Tracks skill usage, source (global/project), provider, model

---

### 5. Override Resolution

**File**: `src/core/context/instructions/user-instructions/skills.ts:121-138`

```typescript
export function getAvailableSkills(skills: SkillMetadata[]): SkillMetadata[] {
  const seen = new Set<string>();
  const result: SkillMetadata[] = [];

  // Iterate backwards: global skills (added last) are seen first
  for (let i = skills.length - 1; i >= 0; i--) {
    const skill = skills[i];
    if (!seen.has(skill.name)) {
      seen.add(skill.name);
      result.unshift(skill);
    }
  }

  return result;
}
```

**Override Strategy**: **Global skills override project skills with same name**

Discovery order:

1. `.clinerules/skills/` (project)
2. `.cline/skills/` (project)
3. `.claude/skills/` (project)
4. `~/.cline/skills/` (global)

Deduplication (backwards iteration):

- Global skills added last, processed first → take precedence
- Project skills with duplicate names ignored
- Result preserves original order (project → global)

---

## Dependencies Analysis

### What Cline Uses

**YAML Parsing**: `js-yaml@4.1.1` (devDependencies in their package.json, but used at runtime)

- **Size**: ~10KB minified
- **Purpose**: Parse YAML frontmatter (only 2 fields: name, description)
- **Usage**: Single function call `yaml.load(yamlContent)`

**HTTP/API Libraries** (not for skills):

- `axios`, `undici`, `openai` - for LLM provider communication
- NOT used for skills system

**VS Code APIs** (not for skills):

- Filesystem access uses Node.js `fs` not VS Code APIs
- Skills work independent of editor

### What SISU Needs (Dependency-Free Approach)

#### Option 1: Zero Dependencies (Recommended for SISU)

**Custom YAML parser** - Limited subset for frontmatter only:

```typescript
function parseSimpleYamlFrontmatter(markdown: string): {
  data: Record<string, string>;
  body: string;
  error?: string;
} {
  const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = markdown.match(regex);
  if (!match) return { data: {}, body: markdown };

  const [, yamlContent, body] = match;
  const data: Record<string, string> = {};

  // Parse simple key-value pairs (name: value)
  // No nested objects, no arrays, no complex YAML features
  const lines = yamlContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }

  return { data, body };
}
```

**Why this works for SISU**:

- Skills frontmatter is MINIMAL: 2 required fields (`name`, `description`)
- Optional fields (future): `author`, `version`, `tags` - all simple strings/numbers
- No need for complex YAML features (nested objects, arrays, multiline strings)
- Fail-open: Invalid YAML → empty data, full body
- **Zero external dependencies** ✅

**Validation with Zod** (we already have it):

```typescript
import { z } from "zod";

const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().min(1).max(500),
  author: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
```

#### Option 2: Minimal Dependency (If YAML complexity grows)

If we later need full YAML support, consider:

- `js-yaml@4.1.1` - 10KB, battle-tested, 160M weekly downloads
- OR `yaml@2.x` - Modern, smaller, better TypeScript support

**Trade-off**: Adds 1 dependency, but handles edge cases (multiline strings, escaping, etc.)

---

## Semantic Matching Research

### Cline's Approach: LLM-Native Matching

**No separate matching system!** Cline relies on:

1. **System prompt injection**: All skill metadata visible to LLM
2. **Natural language descriptions**: Skill authors write for LLM comprehension
3. **LLM reasoning**: Model matches user request → skill description
4. **Direct tool call**: LLM calls `use_skill(skill_name="exact-match")`

**Advantages**:

- ✅ Zero dependencies (no embeddings, no vector DB)
- ✅ Leverages existing LLM strengths (semantic understanding)
- ✅ Works across all models (no provider-specific APIs)
- ✅ Simple to implement (just string concatenation in prompt)
- ✅ Human-readable (developers see what LLM sees)

**Limitations**:

- ❌ Context window limited (~100 skills max before prompt size issue)
- ❌ No fuzzy matching (user must say "create a PR" not "make pull request")
  - BUT: LLMs handle synonyms naturally ("create PR" = "open pull request")
- ❌ No ranking (LLM picks first match, may not be optimal)
  - BUT: Good descriptions + LLM reasoning usually correct

### Alternative: Embedding-Based Matching (Not Used by Cline)

**Hypothetical implementation** (if needed for 500+ skills):

```typescript
// Requires: openai SDK (or other embedding provider)
import OpenAI from "openai";

async function semanticMatch(
  userQuery: string,
  skills: SkillMetadata[],
  topK: number = 5,
): Promise<SkillMetadata[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Embed query
  const queryEmbedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: userQuery,
  });

  // Embed all skill descriptions (cache these!)
  const skillEmbeddings = await Promise.all(
    skills.map((s) =>
      openai.embeddings.create({
        model: "text-embedding-3-small",
        input: s.description,
      }),
    ),
  );

  // Compute cosine similarity
  const similarities = skillEmbeddings.map((emb, i) => ({
    skill: skills[i],
    score: cosineSimilarity(
      queryEmbedding.data[0].embedding,
      emb.data[0].embedding,
    ),
  }));

  // Return top K matches
  return similarities
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.skill);
}
```

**Why SISU should NOT implement this initially**:

1. **Adds dependency**: OpenAI SDK or other embedding provider
2. **Adds cost**: API calls for embeddings (~$0.00002/1K tokens, but adds up)
3. **Adds complexity**: Caching, cache invalidation, embedding model versioning
4. **Not needed**: Works fine with LLM-native matching for 0-100 skills
5. **Violates philosophy**: SISU prefers explicit, simple, dependency-free

**When to reconsider**:

- User has 100+ skills and context window issues arise
- Performance critical (but embedding calls still add latency)
- Cross-skill recommendations needed (semantic browsing)

---

## Resource File Handling

### Cline's Approach

**No special loader!** Skills can reference additional files, but:

- LLM uses existing file tools (`read_file`, `list_files`, etc.)
- Skill instructions include directory path in activation message
- Resources loaded on-demand by LLM as needed

**Example from skill activation**:

```
IMPORTANT: The skill is now loaded. Do NOT call use_skill again for this task.
Simply follow the instructions above to complete the user's request. You may
access other files in the skill directory at: /path/to/.cline/skills/my-skill/
```

**Skill structure** (example from `.cline/skills/create-pull-request/`):

```
create-pull-request/
├── SKILL.md (main instructions)
└── (no additional files in this example, but could have)
    ├── template.md
    ├── examples/
    │   └── example-pr.md
    └── scripts/
        └── validate-pr.sh
```

**LLM workflow**:

1. User: "Create a pull request"
2. LLM: Matches to `create-pull-request` skill
3. LLM: Calls `use_skill(skill_name="create-pull-request")`
4. System: Returns full SKILL.md content + directory path
5. LLM: Reads SKILL.md instructions
6. LLM: (If needed) Calls `read_file(/path/to/skills/create-pull-request/template.md)`
7. LLM: Executes instructions

**No special handling for**:

- Path resolution (LLM uses absolute path provided)
- Resource limits (relies on existing file tool limits)
- Caching (file system caching handles this)

---

## Testing Strategy

### Cline's Test Coverage

**File**: `src/core/context/instructions/user-instructions/__tests__/skills.test.ts`

**Test framework**: Mocha + Chai + Sinon (stubs)

**What they test**:

1. ✅ Discovery from global directory
2. ✅ Discovery from project directories (`.clinerules/`, `.cline/`, `.claude/`)
3. ✅ Override resolution (global > project)
4. ✅ Skip directories without SKILL.md
5. ✅ Handle permission errors gracefully
6. ✅ Validate required fields (name, description)
7. ✅ Name must match directory name
8. ✅ Invalid YAML handling (fail-open)
9. ✅ Content loading on-demand
10. ✅ Toggle filtering (disabled skills excluded)

**Mocking strategy**:

- Stub `fs.promises.readdir`, `fs.promises.stat`, `fs.promises.readFile`
- Stub custom utils `fileExistsAtPath`, `isDirectory`
- Use OS-independent paths (`path.join()` everywhere)
- No actual filesystem access (pure unit tests)

**Coverage target**: Not explicitly stated, but tests cover all critical paths

### Recommended SISU Test Strategy

**Given SISU's ≥80% coverage target**:

```typescript
// packages/middleware/load-skills/__tests__/discover.test.ts
import { describe, it, expect, vi } from "vitest";
import { discoverSkills } from "../src/discover";

describe("discoverSkills", () => {
  it("discovers skills from global directory", async () => {
    // Mock fs.readdir, fs.stat, fs.readFile
    // Assert metadata parsed correctly
  });

  it("discovers skills from project directories", async () => {
    // Test .clinerules/, .cline/, .claude/
  });

  it("handles missing directories gracefully", async () => {
    // No directories → empty array
  });

  it("skips directories without SKILL.md", async () => {
    // Directory with other files → ignored
  });

  it("validates required fields", async () => {
    // Missing name → null, warning logged
    // Missing description → null, warning logged
  });

  it("validates name matches directory", async () => {
    // name: "foo", dir: "bar" → null, warning
  });

  it("handles invalid YAML gracefully", async () => {
    // Malformed YAML → empty data, full body, error flag
  });

  it("resolves overrides correctly", async () => {
    // Global "foo" + Project "foo" → Global wins
  });
});

// packages/middleware/load-skills/__tests__/frontmatter.test.ts
describe("parseSimpleYamlFrontmatter", () => {
  it("parses valid frontmatter", () => {
    const input = "---\nname: test\ndescription: A test\n---\nBody";
    const result = parseSimpleYamlFrontmatter(input);
    expect(result.data.name).toBe("test");
    expect(result.data.description).toBe("A test");
    expect(result.body).toBe("Body");
  });

  it("handles no frontmatter", () => {
    const input = "Just body text";
    const result = parseSimpleYamlFrontmatter(input);
    expect(result.data).toEqual({});
    expect(result.body).toBe("Just body text");
  });

  it("handles malformed frontmatter", () => {
    const input = "---\ninvalid yaml: {{{ \n---\nBody";
    const result = parseSimpleYamlFrontmatter(input);
    // Fail-open: should not throw, return empty data
  });

  it("removes quotes from values", () => {
    const input = "---\nname: \"test\"\ndescription: 'quoted'\n---\nBody";
    const result = parseSimpleYamlFrontmatter(input);
    expect(result.data.name).toBe("test");
    expect(result.data.description).toBe("quoted");
  });
});

// packages/middleware/activate-skills/__tests__/handler.test.ts
describe("UseSkillToolHandler", () => {
  it("activates skill by name", async () => {
    // Mock getSkillContent
    // Assert returns formatted response
  });

  it("returns error if skill not found", async () => {
    // Request unknown skill → error message + available list
  });

  it("returns error if skill_name missing", async () => {
    // Missing parameter → error
  });

  it("filters by toggle state", async () => {
    // Disabled skill → excluded from available list
  });
});
```

**Tools**: Vitest (already used by SISU), `vi.mock()` for filesystem

---

## Integration with SISU

### Alignment with SISU Philosophy

**SISU Values** → **Cline Implementation**:

| SISU Principle                 | Cline Approach                                      | SISU Fit       |
| ------------------------------ | --------------------------------------------------- | -------------- |
| **Explicit over implicit**     | Skills require explicit `use_skill` tool call       | ✅ Perfect fit |
| **Composable over monolithic** | Single-purpose tool, reuses existing file tools     | ✅ Perfect fit |
| **Observable**                 | Skill activation logged, content visible in trace   | ✅ Perfect fit |
| **TypeScript-first**           | Fully typed with interfaces, no `any`               | ✅ Perfect fit |
| **Zero magic**                 | No hidden skill activation, LLM-driven matching     | ✅ Perfect fit |
| **Dependency-free**            | Only `js-yaml` (can be replaced with custom parser) | ⚠️ Can improve |

**Key Insight**: Cline's implementation is **simpler and more explicit** than our initial Option C design!

### Recommended SISU Architecture (Revised)

**Before Cline analysis**: Option C (Hybrid) with 2 middleware + tool extensions

**After Cline analysis**: **Simpler Option D** (Cline-inspired)

```
@sisu-ai/mw-skills (SINGLE middleware package)
├─ src/
│  ├─ index.ts              # Main middleware
│  ├─ discover.ts           # Scan filesystem
│  ├─ frontmatter.ts        # Parse YAML (dependency-free!)
│  ├─ types.ts              # SkillMetadata, SkillContent
│  └─ tool-handler.ts       # use_skill tool
└─ package.json
    └─ dependencies: { "zod": "^3.x" }  # ONLY DEPENDENCY
```

**Single middleware** handles:

1. Discovery (startup): Scan directories, load metadata
2. System prompt injection: Add skills list + use_skill tool
3. Activation (on-demand): Load full content when tool called
4. No separate activation middleware needed!

**Why simpler than Option C**:

- Discovery + Activation in same package (cohesive)
- No need for separate `tool-read-file` extension (LLM uses existing tools)
- No semantic matching middleware (LLM handles this naturally)
- Single import: `app.use(skillsMiddleware({ cwd: '/path' }))`

### Migration from Option C to Simpler Design

**Original Option C**:

```typescript
import { loadSkillsMiddleware } from "@sisu-ai/mw-load-skills";
import { activateSkillsMiddleware } from "@sisu-ai/mw-activate-skills";

app.use(loadSkillsMiddleware({ cwd: process.cwd() }));
app.use(activateSkillsMiddleware());
```

**New Cline-inspired design**:

```typescript
import { skillsMiddleware } from "@sisu-ai/mw-skills";

app.use(skillsMiddleware({ cwd: process.cwd() }));
```

**Internal flow**:

1. Middleware initialization: `discoverSkills(cwd)` → metadata loaded
2. Before generate: Inject `ctx.skills` + `use_skill` tool
3. Tool call: `use_skill(skill_name)` → load content, return instructions
4. LLM: Follow instructions, may call file tools for resources

---

## Key Learnings for SISU

### 1. Dependency Minimalism is Achievable

**Cline uses 1 dependency (`js-yaml`) for a single task: YAML parsing**

SISU can achieve **ZERO dependencies**:

- Custom YAML parser for simple frontmatter (~50 lines)
- Use Zod (already have) for validation
- Node.js `fs/promises` for filesystem
- No embeddings, no vector DB, no HTTP clients

**Trade-off**: Custom YAML parser limits feature set, but skills don't need complex YAML.

### 2. LLM-Native Matching is Sufficient

**No need for semantic search for 0-100 skills!**

- Modern LLMs excel at matching descriptions to intent
- System prompt injection scales to ~100 skills before context issues
- Users report Cline skill matching works well in practice
- Embeddings add complexity, cost, dependencies for minimal gain at this scale

**When to add embeddings**: 100+ skills, performance issues, or cross-skill discovery UI

### 3. Progressive Disclosure Works Well

**Cline's 2-level approach** (simpler than our 3-level plan):

1. **Metadata always in context** (name + description)
2. **Full content on-demand** (when `use_skill` called)

**No need for intermediate level!** LLM decides when to activate based on metadata alone.

### 4. Fail-Open Design is Critical

**Every parsing step fails gracefully**:

- No frontmatter → Empty data, full body
- Invalid YAML → Empty data, full body, error flag
- Missing fields → Skip skill, log warning, continue
- Permission denied → Skip directory, continue

**Result**: System never crashes, always provides best-effort service

### 5. Tool Integration Over Custom Loaders

**Cline doesn't create special resource loaders!**

- Skills reference directory path
- LLM uses existing `read_file` tool
- No custom file resolution logic
- No caching beyond filesystem
- Simpler implementation, reuses existing tools

**SISU takeaway**: Extend existing tools via context, not new tools

### 6. Testing via Mocking is Essential

**Cline's approach**:

- Mock all filesystem operations (no real files in tests)
- Use OS-independent paths (`path.join()`)
- Test error paths (permission denied, missing files, etc.)
- Test validation logic (name match, required fields)

**SISU already uses Vitest**: Same pattern will work well

---

## Implementation Checklist for SISU

### Phase 1: Core Discovery (Week 1)

- [ ] Create `@sisu-ai/mw-skills` package
- [ ] Implement `parseSimpleYamlFrontmatter()` (dependency-free)
- [ ] Implement `discoverSkills()` with scan logic
- [ ] Implement `loadSkillMetadata()` with validation
- [ ] Implement `getAvailableSkills()` with override resolution
- [ ] Add Zod schemas for `SkillMetadata` and `SkillContent`
- [ ] Write unit tests (≥80% coverage)
- [ ] Document frontmatter format in README

### Phase 2: Tool Integration (Week 1-2)

- [ ] Implement `use_skill` tool handler
- [ ] Implement `getSkillContent()` for on-demand loading
- [ ] Add system prompt injection logic
- [ ] Handle toggle filters (optional: if needed)
- [ ] Add telemetry (optional: skill usage tracking)
- [ ] Write integration tests
- [ ] Create example skill in `examples/skills/hello-skill/`

### Phase 3: Documentation & Examples (Week 2)

- [ ] Write middleware README with usage examples
- [ ] Document skill authoring guidelines
- [ ] Create 3-5 example skills:
  - `create-pull-request` (like Cline's)
  - `explain-code` (educational)
  - `debug-agent` (meta)
  - `web-research` (tool-heavy)
  - `code-review` (analysis)
- [ ] Add skills section to main SISU docs
- [ ] Create video tutorial or blog post

### Phase 4: Polish & Optimization (Week 3)

- [ ] Add file watcher for skill changes (optional)
- [ ] Implement skill validation CLI (`pnpm sisu validate-skill`)
- [ ] Add skill template generator (`pnpm sisu create-skill`)
- [ ] Performance testing (1000 skills discovery time)
- [ ] Error message improvements
- [ ] Edge case handling (symlinks, hidden files, etc.)

### Phase 5: Ecosystem (Week 4+)

- [ ] Publish skills marketplace docs
- [ ] Create `awesome-sisu-skills` GitHub repo
- [ ] Add skill import command (`pnpm sisu install-skill <url>`)
- [ ] VS Code extension for skill authoring
- [ ] Skill testing framework
- [ ] Community skill contributions

---

## Comparison to Original Design

### Option C (Pre-Cline Analysis)

```
@sisu-ai/mw-load-skills        - Discovery, indexing
@sisu-ai/mw-activate-skills    - Activation, semantic matching
Extend @sisu-ai/tool-read-file - Resource loading
```

**Complexity**: 2 packages + 1 tool extension = 3 integration points

### Cline-Inspired Design (Recommended)

```
@sisu-ai/mw-skills - Discovery + activation + tool handler
```

**Complexity**: 1 package = 1 integration point

**Removed features** (from Option C):

- ❌ Semantic matching middleware (LLM does this naturally)
- ❌ Separate activation package (combine with discovery)
- ❌ Tool extensions (reuse existing tools)

**Added simplicity**:

- ✅ Single middleware import
- ✅ Zero dependencies (custom YAML parser)
- ✅ Smaller API surface
- ✅ Easier to test and maintain

---

## Dependency Decision Matrix

| Option                 | Dependencies | Pros                                              | Cons                                    | Recommendation                            |
| ---------------------- | ------------ | ------------------------------------------------- | --------------------------------------- | ----------------------------------------- |
| **Custom YAML parser** | Zod only     | ✅ Zero deps<br>✅ Full control<br>✅ Tiny bundle | ⚠️ Limited features<br>⚠️ Must maintain | ✅ **RECOMMENDED**                        |
| **js-yaml**            | js-yaml, Zod | ✅ Battle-tested<br>✅ Full YAML spec             | ❌ +1 dep<br>❌ 10KB bundle             | ⚠️ Fallback if custom parser insufficient |
| **yaml (eemeli)**      | yaml, Zod    | ✅ Modern<br>✅ Better TS                         | ❌ +1 dep<br>❌ Larger bundle           | ❌ Not needed                             |

**Decision**: Start with **custom parser**, add `js-yaml` only if users need advanced YAML features.

---

## Risks & Mitigations

### Risk 1: Custom YAML Parser Too Limited

**Scenario**: Users want nested objects, arrays, multiline strings in frontmatter

**Likelihood**: Low (Cline, Claude, skills.sh all use simple frontmatter)

**Mitigation**:

1. Document supported frontmatter features in README
2. Add validation that catches unsupported syntax
3. Keep `js-yaml` as optional peer dependency
4. Provide migration path if needed

### Risk 2: LLM Matching Fails with Many Skills

**Scenario**: User has 200 skills, context window exceeded or LLM confused

**Likelihood**: Medium (will happen as ecosystem grows)

**Mitigation**:

1. Document recommended skill count (~50 max)
2. Add warning when >100 skills detected
3. Implement skill categories/tagging (future)
4. Add embeddings-based filtering as opt-in (Phase 5)

### Risk 3: Skill Versioning Issues

**Scenario**: User updates skill, old agents still use cached version

**Likelihood**: Medium (dev experience issue)

**Mitigation**:

1. No caching in v1 (always fresh read)
2. Add file watcher for auto-refresh (Phase 4)
3. Add version field to frontmatter (optional)
4. Document best practices for breaking changes

### Risk 4: Security (Malicious Skills)

**Scenario**: User installs skill with dangerous instructions

**Likelihood**: Low initially, High at scale

**Mitigation**:

1. SISU's existing tool approval system covers this
2. Document security model: "Skills are instructions, not code"
3. Add skill verification command (Phase 4)
4. Community review for marketplace skills (Phase 5)

---

## Conclusion

**Cline's implementation validates our hypothesis that filesystem-based skills can be simple, dependency-free, and effective.**

**Key takeaways for SISU**:

1. ✅ **Use Cline's architecture as blueprint** - proven at scale (57K stars)
2. ✅ **Zero dependencies achievable** - custom YAML parser is sufficient
3. ✅ **LLM-native matching works** - no need for embeddings initially
4. ✅ **Single middleware package** - simpler than our Option C design
5. ✅ **Fail-open everywhere** - robust error handling critical
6. ✅ **Progressive disclosure** - metadata always, content on-demand
7. ✅ **Reuse existing tools** - no special resource loaders needed

**Recommended path forward**:

1. Implement simplified Cline-inspired architecture
2. Start with custom YAML parser (add `js-yaml` only if needed)
3. Skip semantic matching (rely on LLM)
4. Write comprehensive tests (≥80% coverage)
5. Create 5+ example skills for validation
6. Gather community feedback before adding complexity

**Estimated effort**: 2-3 weeks for production-ready implementation (vs. 4-6 weeks for Option C)

---

## Appendix: Code Snippets

### A. Cline's Skill Discovery

```typescript
// Simplified from src/core/context/instructions/user-instructions/skills.ts
async function discoverSkills(cwd: string): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];

  // Global: ~/.cline/skills
  const globalSkillsDir = await ensureSkillsDirectoryExists();

  // Project: .clinerules/skills, .cline/skills, .claude/skills
  const projectDirs = [
    path.join(cwd, ".clinerules/skills"),
    path.join(cwd, ".cline/skills"),
    path.join(cwd, ".claude/skills"),
  ];

  // Scan project dirs first (lower priority)
  for (const dir of projectDirs) {
    skills.push(...(await scanSkillsDirectory(dir, "project")));
  }

  // Scan global dir last (higher priority)
  skills.push(...(await scanSkillsDirectory(globalSkillsDir, "global")));

  return skills;
}
```

### B. Custom YAML Parser (SISU Implementation)

```typescript
// Dependency-free frontmatter parser for SISU
export function parseSimpleYamlFrontmatter(markdown: string): {
  data: Record<string, string>;
  body: string;
  hadFrontmatter: boolean;
  parseError?: string;
} {
  const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = markdown.match(regex);

  if (!match) {
    return { data: {}, body: markdown, hadFrontmatter: false };
  }

  const [, yamlContent, body] = match;
  const data: Record<string, string> = {};

  try {
    const lines = yamlContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Parse key: value
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex === -1) continue;

      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      // Remove surrounding quotes
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

### C. SISU Middleware Skeleton

```typescript
// packages/middleware/skills/src/index.ts
import type { Middleware } from "@sisu-ai/core";
import { discoverSkills } from "./discover";
import { useSkillTool } from "./tool";

export interface SkillsMiddlewareOptions {
  cwd: string;
  globalDir?: string; // Default: ~/.sisu/skills
  projectDirs?: string[]; // Default: ['.sisu/skills', '.claude/skills']
}

export function skillsMiddleware(options: SkillsMiddlewareOptions): Middleware {
  return async (ctx, next) => {
    // Discovery phase (once per context)
    if (!ctx.skills) {
      ctx.skills = await discoverSkills(options);
    }

    // Add use_skill tool
    ctx.tools = ctx.tools || [];
    ctx.tools.push(useSkillTool(ctx.skills));

    // Inject skills into system prompt
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

---

**Document version**: 1.0  
**Last updated**: 2025-02-12  
**Author**: AI Research Analysis for SISU Framework  
**Next steps**: Review findings, validate approach, proceed to implementation
