# Sisu Skills Support

Sisu has native support for Claude-compatible Skills through the `@sisu-ai/mw-skills` middleware.

## What are Skills?

Skills are filesystem-based capabilities that extend agent functionality. Each Skill is a `SKILL.md` file with:

- **YAML frontmatter** - Metadata (name, description)
- **Markdown body** - Instructions and workflows
- **Optional resources** - Scripts, templates, reference files

Skills use progressive disclosure: only metadata is loaded initially, full instructions load on-demand.

## Installation

```bash
pnpm add @sisu-ai/mw-skills
```

## Basic usage

```typescript
import { Agent } from "@sisu-ai/core";
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const app = new Agent()
  .use(
    skillsMiddleware({
      directories: [".sisu/skills", "custom-skills"],
    }),
  )
  .use(errorBoundary())
  .use(traceViewer());
// ... rest of your middleware
```

The middleware:

1. **Discovers skills** from specified directories
2. **Registers `use_skill` tool** that loads instructions on-demand
3. **Injects metadata** into system prompt for skill discovery

## Creating a Skill

### Directory structure

```text
.sisu/skills/
└── my-skill/
    ├── SKILL.md           # Required: main instructions
    ├── reference.md       # Optional: additional docs
    ├── examples.md        # Optional: usage examples
    └── scripts/
        └── helper.py      # Optional: utility scripts
```

### SKILL.md format

```yaml
---
name: my-skill
description: Brief description of what this skill does and when to use it. Include key terms for discovery.
---

# My Skill

## Quick start

Basic usage instructions...

## Advanced features

See [reference.md](reference.md) for detailed API.
See [examples.md](examples.md) for common patterns.

## Utility scripts

Run `python scripts/helper.py` to process data.
```

**Required fields:**

- `name` - lowercase, letters/numbers/hyphens only, max 64 chars
- `description` - max 1024 chars, should include WHAT and WHEN

## Progressive disclosure

Skills load in three levels:

| Level               | When                    | Token Cost        | Content            |
| ------------------- | ----------------------- | ----------------- | ------------------ |
| **1: Metadata**     | Startup                 | ~100 tokens/skill | Name + description |
| **2: Instructions** | When `use_skill` called | <5k tokens        | SKILL.md body      |
| **3: Resources**    | As needed               | Variable          | Referenced files   |

**Example:**

1. LLM sees metadata: "pdf-processing - Extract text from PDFs"
2. User asks: "Extract text from this PDF"
3. LLM calls: `use_skill({ name: "pdf-processing" })`
4. Instructions loaded into context
5. LLM reads `reference.md` if needed

## Configuration options

```typescript
skillsMiddleware({
  // Required: directories to scan
  directories: [".sisu/skills", "team-skills"],

  // OR single directory shorthand
  directory: ".sisu/skills",

  // Base path for relative directories
  cwd: process.cwd(),

  // File size limits
  maxFileSize: 100_000, // 100KB per file
  maxSkillSize: 500_000, // 500KB per skill

  // Cache settings
  cacheTtl: 5 * 60 * 1000, // 5 minutes

  // Filter skills
  include: ["pdf-processing", "data-analysis"],
  exclude: ["experimental-skill"],
});
```

## Tool alias compatibility

Many ecosystem skills expect snake_case tool names. Use aliases:

```typescript
import { registerTools } from '@sisu-ai/mw-register-tools';
import { terminal } from '@sisu-ai/tool-terminal';

.use(registerTools(terminal.tools, {
  aliases: {
    terminalRun: 'bash',
    terminalReadFile: 'read_file',
    terminalWriteFile: 'write_file',
    terminalCd: 'cd'
  }
}))
.use(skillsMiddleware({ directories: ['.sisu/skills'] }))
```

## Complete example

```typescript
import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { skillsMiddleware } from "@sisu-ai/mw-skills";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { terminal } from "@sisu-ai/tool-terminal";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { toolCalling } from "@sisu-ai/mw-tool-calling";

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-5.4" }),
  input: "Use the pdf-processing skill to extract text from document.pdf",
  systemPrompt: "You are a helpful assistant with access to skills.",
});

const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(
    registerTools(terminal.tools, {
      aliases: {
        terminalRun: "bash",
        terminalReadFile: "read_file",
      },
    }),
  )
  .use(
    skillsMiddleware({
      directories: [".sisu/skills"],
      maxFileSize: 100_000,
      cacheTtl: 5 * 60 * 1000,
    }),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);

await app.handler()(ctx);
```

## Skill authoring best practices

1. **Concise descriptions** - Include what and when to use
2. **Progressive disclosure** - Main instructions in SKILL.md, details in separate files
3. **Clear file references** - Keep references one level deep
4. **Utility scripts** - Provide reliable scripts instead of asking LLM to generate
5. **Examples over explanations** - Show concrete examples
6. **Assume intelligence** - Claude already knows common concepts

**Good example:**

````yaml
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---

# PDF Processing

Extract text with pdfplumber:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
````

For form filling, see [FORMS.md](FORMS.md).

````

**Bad example (too verbose):**
```yaml
---
name: pdf-helper
description: Helps with PDFs
---

# PDF Helper

PDF (Portable Document Format) files are a common file format...
[Unnecessary explanations that waste tokens]
````

## Use case: Team knowledge

Create skills for team processes:

```text
.sisu/skills/
├── code-review/
│   └── SKILL.md        # Code review guidelines
├── deployment/
│   ├── SKILL.md        # Deployment procedures
│   └── checklist.md    # Pre-deploy checklist
└── api-design/
    ├── SKILL.md        # API design patterns
    └── examples.md     # Example APIs
```

Each team member's agent automatically has access to team knowledge.

## Use case: Domain expertise

Bundle domain-specific workflows:

```text
.sisu/skills/
├── bigquery-analysis/
│   ├── SKILL.md
│   └── schemas/
│       ├── finance.md
│       ├── sales.md
│       └── product.md
└── pdf-processing/
    ├── SKILL.md
    ├── FORMS.md
    └── scripts/
        └── extract.py
```

## Debugging skills

Enable trace viewer to see skill loading:

```typescript
.use(traceViewer())  // Watch for use_skill calls

// Check skill discovery
ctx.log.info('Loaded skills:', ctx.tools.get('use_skill'));
```

Check the HTML trace to see:

- Which skills were discovered
- When `use_skill` was called
- What instructions were loaded
- Any errors during skill loading

## Best practices

1. **Keep SKILL.md under 500 lines** - Split content into reference files
2. **Use forward slashes** in paths - Works cross-platform
3. **Test skill discovery** - Verify descriptions are clear
4. **Cache appropriately** - Balance freshness vs performance
5. **Set size limits** - Prevent loading huge files
6. **Version control skills** - Track changes to team knowledge
7. **Document tool dependencies** - List required tools in SKILL.md

## Common mistakes

### ❌ Vague descriptions

```yaml
# WRONG
description: Helps with documents

# CORRECT
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or document extraction.
```

### ❌ Not specifying directories

```typescript
// WRONG - no implicit defaults
skillsMiddleware({});

// CORRECT
skillsMiddleware({ directories: [".sisu/skills"] });
```

### ❌ Forgetting tool aliases

```typescript
// WRONG - skills expect 'read_file' but tool is 'terminalReadFile'
.use(registerTools(terminal.tools))
.use(skillsMiddleware({ directories: ['.sisu/skills'] }))

// CORRECT
.use(registerTools(terminal.tools, {
  aliases: { terminalReadFile: 'read_file' }
}))
.use(skillsMiddleware({ directories: ['.sisu/skills'] }))
```

## External docs

- [Skills middleware README](https://github.com/finger-gun/sisu/tree/main/packages/middleware/skills)
- [OpenAI skills example](https://github.com/finger-gun/sisu/tree/main/examples/openai-skills)
- [Anthropic skills example](https://github.com/finger-gun/sisu/tree/main/examples/anthropic-skills)
- [Claude Skills documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
