# Quick Start: Using Sisu Documentation with Agents

## Option 1: Single Markdown Guide (Fastest)

Perfect for quick context or sharing with any AI tool.

### Use directly in prompts

```
Read this Sisu framework guide:
[paste contents of SISU_AGENT_GUIDE.md]

Now help me build an agent that uses web search and RAG.
```

### Copy to your project

```bash
# Copy to your project for easy reference
cp SISU_AGENT_GUIDE.md ~/my-project/docs/
```

**Best for**: Quick reference, any AI tool, documentation

---

## Option 2: Claude Agent Skill (Production)

Automatic discovery and token-efficient loading.

### For Claude Code

```bash
# Install globally
cp -r skills/sisu-framework ~/.claude/skills/

# Or per-project
cp -r skills/sisu-framework ./.claude/skills/
```

### For Claude API

```typescript
import { Agent } from "@sisu-ai/core";
import { skillsMiddleware } from "@sisu-ai/mw-skills";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { terminal } from "@sisu-ai/tool-terminal";

const app = new Agent()
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
      directories: ["./skills"],
    }),
  );
// ... rest of your agent
```

### For claude.ai

1. Zip the skill directory:
   ```bash
   cd skills
   zip -r sisu-framework.zip sisu-framework/
   ```
2. Upload via Settings > Features in claude.ai

**Best for**: Production agents, Claude ecosystem, teams

---

## Which Should I Use?

| Scenario                   | Use This                 |
| -------------------------- | ------------------------ |
| Quick help with Sisu       | Markdown Guide in prompt |
| Documentation reference    | Markdown Guide in docs   |
| Production Claude agent    | Claude Skill             |
| Claude Code development    | Claude Skill             |
| Claude API integration     | Claude Skill             |
| Non-Claude AI tools        | Markdown Guide           |
| Teaching/sharing knowledge | Markdown Guide           |
| Team-wide deployment       | Both                     |

---

## Testing the Skill

### Test in Claude Code

```typescript
// Ask Claude:
"Use the sisu-framework skill to help me create an agent
that searches the web and summarizes results."

// Claude will automatically:
// 1. Detect it needs Sisu knowledge
// 2. Load the skill via use_skill tool
// 3. Reference the documentation
// 4. Help you build the agent
```

### Test via API

```bash
# Run example that uses skills
pnpm ex:openai:skills

# Check the trace to see skill loading
open examples/openai-skills/traces/trace.html
```

---

## File Locations

```
sisu/
├── SISU_AGENT_GUIDE.md          # Single markdown guide (5,800 lines)
├── AGENT_DOCS_SUMMARY.md        # This comparison document
└── skills/
    └── sisu-framework/          # Claude Agent Skill
        ├── SKILL.md             # Main instructions
        ├── CONTROL_FLOW.md      # Control flow patterns
        ├── RAG.md               # RAG patterns
        ├── TOOLS.md             # Tools reference
        ├── STREAMING.md         # Streaming patterns
        ├── SISU_SKILLS.md       # Skills support
        ├── EXAMPLES.md          # Working examples
        └── README.md            # Skill documentation
```

---

## Examples

### Example 1: Using the markdown guide

```typescript
import fs from "fs";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";

const sisuGuide = fs.readFileSync("SISU_AGENT_GUIDE.md", "utf-8");

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Create an agent with web search and RAG capabilities",
  systemPrompt: `${sisuGuide}\n\nYou are an expert at building Sisu agents.`,
});

// Agent will have full Sisu knowledge from the guide
```

### Example 2: Using the Claude skill

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { skillsMiddleware } from "@sisu-ai/mw-skills";
import { toolCalling } from "@sisu-ai/mw-tool-calling";

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Show me how to build a RAG agent with Sisu",
  systemPrompt: "You are a helpful Sisu expert.",
});

const app = new Agent()
  .use(
    skillsMiddleware({
      directories: ["./skills"],
    }),
  )
  .use(toolCalling);

await app.handler()(ctx);
// Agent will use_skill to load Sisu knowledge as needed
```

---

## Sharing with Your Team

### For development teams

```bash
# Add to your monorepo
git add skills/sisu-framework
git commit -m "Add Sisu framework skill for agents"
git push

# Team members can then:
cp -r skills/sisu-framework ~/.claude/skills/
```

### For documentation

```bash
# Add guide to docs
cp SISU_AGENT_GUIDE.md docs/references/
```

### For CI/CD

```yaml
# .github/workflows/deploy-skills.yml
- name: Deploy skills
  run: |
    zip -r sisu-framework.zip skills/sisu-framework/
    # Upload to your artifact storage
```

---

## Updating the Documentation

When Sisu releases new features:

1. **Update the markdown guide**

   ```bash
   # Edit SISU_AGENT_GUIDE.md with new features
   git commit -m "Update Sisu guide with v2.0 features"
   ```

2. **Update the skill**

   ```bash
   # Edit relevant files in skills/sisu-framework/
   # E.g., add new middleware to CONTROL_FLOW.md
   git commit -m "Add new control flow patterns to skill"
   ```

3. **Redistribute**
   - Re-zip and upload to claude.ai
   - Push to git for team to pull
   - Update API skill directories

---

## Troubleshooting

### Skill not loading

```bash
# Check directories are configured
skillsMiddleware({
  directories: ['./skills']  # Must be explicit
})

# Check skill metadata
cat skills/sisu-framework/SKILL.md
# Verify YAML frontmatter has name and description
```

### Tool aliases missing

```typescript
// Skills expect snake_case tools
.use(registerTools(terminal.tools, {
  aliases: {
    terminalRun: 'bash',
    terminalReadFile: 'read_file',
    terminalWriteFile: 'write_file'
  }
}))
```

### Skill too large

```typescript
// Increase limits if needed
skillsMiddleware({
  directories: ["./skills"],
  maxFileSize: 200_000, // Default: 100KB
  maxSkillSize: 1_000_000, // Default: 500KB
});
```

---

## Next Steps

1. ✅ Choose your approach (guide, skill, or both)
2. ✅ Test with a simple Sisu agent question
3. ✅ Integrate into your workflow
4. ✅ Share with your team
5. ✅ Keep updated with Sisu releases

**Happy agent building with Sisu!** 🚀
