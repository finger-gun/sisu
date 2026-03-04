# Sisu Documentation for Agents - Summary

This directory contains two approaches for helping agents understand and use Sisu:

## 1. Standalone Markdown Guide (SISU_AGENT_GUIDE.md)

**Location**: `/Users/lejahmie/projects/sisu/SISU_AGENT_GUIDE.md`

**Purpose**: A single, comprehensive markdown file that can be:

- Loaded into any project as context
- Shared across different AI tools
- Used as a reference document
- Included in documentation sites

**Features**:

- ✅ Single file (easy to copy/paste)
- ✅ Completely portable
- ✅ All links point to GitHub (external)
- ✅ Comprehensive coverage (~500 lines)
- ✅ Code examples throughout
- ✅ Best practices included

**Use when**:

- You want to give an agent quick context about Sisu
- You need a portable reference
- You want to include Sisu knowledge in prompts
- You're working outside of Claude's skill system

## 2. Claude Agent Skill (skills/sisu-framework/)

**Location**: `/Users/lejahmie/projects/sisu/skills/sisu-framework/`

**Purpose**: A proper Claude Agent Skill following Claude's official format and best practices.

**Structure**:

```
skills/sisu-framework/
├── SKILL.md           # Main instructions (~360 lines)
├── CONTROL_FLOW.md    # Control flow patterns (~250 lines)
├── RAG.md             # RAG patterns (~180 lines)
├── TOOLS.md           # Built-in & custom tools (~250 lines)
├── STREAMING.md       # Streaming patterns (~280 lines)
├── SISU_SKILLS.md     # Sisu's skills support (~240 lines)
├── EXAMPLES.md        # Working examples (~240 lines)
└── README.md          # Skill documentation
```

**Features**:

- ✅ Progressive disclosure (loads content as needed)
- ✅ Token-efficient (only loads relevant sections)
- ✅ Follows Claude's skill format
- ✅ YAML frontmatter for discovery
- ✅ Organized by topic
- ✅ Works across Claude products (API, claude.ai, Claude Code)

**Use when**:

- Building agents with Claude API
- Using Claude Code for development
- Want automatic skill discovery
- Need token-efficient documentation loading
- Building team-wide agent capabilities

## Key Differences

| Feature         | Markdown Guide      | Claude Skill             |
| --------------- | ------------------- | ------------------------ |
| **Format**      | Single .md file     | Multiple .md files       |
| **Token usage** | All loaded at once  | Progressive disclosure   |
| **Portability** | Maximum             | Claude ecosystem only    |
| **Discovery**   | Manual inclusion    | Automatic via metadata   |
| **Updates**     | Replace entire file | Update specific sections |
| **Best for**    | Quick reference     | Production agents        |

## Using the Claude Skill

### In Claude Code

```bash
# Copy to your skills directory
cp -r skills/sisu-framework ~/.claude/skills/
```

### In Claude API

```typescript
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const app = new Agent().use(
  skillsMiddleware({
    directories: ["./skills"],
  }),
);
```

### In claude.ai

1. Zip the `skills/sisu-framework` directory
2. Go to Settings > Features
3. Upload the zip file

## Using the Markdown Guide

### As context in prompts

```
Read this guide about Sisu framework:
[paste SISU_AGENT_GUIDE.md contents]

Now help me build an agent that...
```

### As a loaded file

```typescript
import fs from "fs";

const guide = fs.readFileSync("SISU_AGENT_GUIDE.md", "utf-8");
const systemPrompt = `${guide}\n\nYou are an expert Sisu developer.`;
```

### In documentation

Include as reference material in your project's docs.

## Recommendation

**For development**: Use the **Claude Skill** for efficient, automatic assistance while coding

**For sharing**: Use the **Markdown Guide** when you need to quickly give context to any AI tool

**For teams**: Deploy both:

- Skill in Claude Code for developers
- Guide in your documentation for reference
- Skill via API for production agents

## Updating

Both resources should be kept in sync with Sisu releases:

1. **Markdown Guide**: Update the single file
2. **Claude Skill**: Update relevant .md files in the skill directory

Consider automating updates by generating both from the same source content.

## What's Covered

Both resources include:

- ✅ Installation and setup
- ✅ Core concepts (Context, Middleware, Tools)
- ✅ LLM adapters (OpenAI, Anthropic, Ollama)
- ✅ Essential middleware patterns
- ✅ Built-in tools
- ✅ Error handling
- ✅ Logging and tracing
- ✅ Common patterns
- ✅ Best practices
- ✅ Common mistakes
- ✅ Working examples
- ✅ External links to GitHub

## Next Steps

1. **Test the skill**: Try it in Claude Code or via the API
2. **Gather feedback**: See what questions agents still struggle with
3. **Iterate**: Update based on actual usage patterns
4. **Share**: Distribute to your team
5. **Maintain**: Keep in sync with Sisu releases

## Files Created

### Standalone Guide

- `/Users/lejahmie/projects/sisu/SISU_AGENT_GUIDE.md` (5,800+ lines)

### Claude Skill

- `/Users/lejahmie/projects/sisu/skills/sisu-framework/SKILL.md` (360 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/CONTROL_FLOW.md` (250 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/RAG.md` (180 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/TOOLS.md` (250 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/STREAMING.md` (280 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/SISU_SKILLS.md` (240 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/EXAMPLES.md` (240 lines)
- `/Users/lejahmie/projects/sisu/skills/sisu-framework/README.md` (documentation)

Total: ~8,000 lines of comprehensive Sisu documentation for agents!
