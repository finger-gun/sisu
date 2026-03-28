# Sisu Framework Skill

An agent skill and reference bundle for working with the Sisu TypeScript framework for building AI agents.

## What is this?

This is an [Agent Skill](https://agentskills.io/) that provides comprehensive knowledge about the Sisu framework. It enables agents to help you build agents using Sisu's middleware-based architecture.

## Structure

```
sisu-framework/
├── SKILL.md            # Main skill instructions (loaded when triggered)
├── CONTROL_FLOW.md     # Control flow patterns (branch, loop, parallel, graph)
├── RAG.md              # Retrieval augmented generation patterns
├── TOOLS.md            # Built-in tools and custom tool creation
├── STREAMING.md        # Token streaming and real-time responses
├── SISU_SKILLS.md      # Sisu's own skills support
├── EXAMPLES.md         # 25+ working examples from the repo
└── README.md           # This file
```

## Using this skill

### Quick install

Use the installer CLI:

```bash
npx @sisu-ai/skill-install
```

Supported targets:

- Claude Code / Claude Desktop
- Cline
- Roo Code
- Windsurf
- Kilo Code
- Codex CLI
- GitHub Copilot

For Codex and Copilot, the installer adds a managed bridge file and also copies the full reference docs under `.sisu/skills/sisu-framework/`.

### Manual install

Copy this directory into your tool's skill folder, for example:

- `~/.claude/skills/sisu-framework/`
- `.claude/skills/sisu-framework/`
- `.cline/skills/sisu-framework/`
- `.roo/skills/sisu-framework/`
- `.windsurf/skills/sisu-framework/`

Codex and Copilot are not native `SKILL.md` loaders, so prefer `npx @sisu-ai/skill-install` for those targets.

### In Agent API

```typescript
import { Agent } from "@sisu-ai/core";
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const app = new Agent().use(
  skillsMiddleware({
    directories: ["./skills"],
  }),
);
// ... rest of your agent setup
```

## What it covers

- **Core concepts** - Context, middleware, tools
- **LLM adapters** - OpenAI, Anthropic, Ollama
- **Middleware** - Control flow, safety, observability
- **Built-in tools** - Web, cloud, dev, data tools
- **Custom tools** - Creating your own tools
- **Error handling** - Structured errors and recovery
- **Streaming** - Real-time token streaming
- **RAG** - Retrieval augmented generation
- **Skills** - Sisu's own skills support
- **Examples** - 25+ working examples

## When agents use this skill

Agents automatically loads this skill when you:

- Ask about building AI agents
- Mention Sisu framework
- Need help with middleware patterns
- Want to implement tool calling
- Set up LLM adapters
- Work with control flow
- Build RAG systems
- Debug agent behavior

## Progressive disclosure

The skill uses the standard progressive disclosure pattern:

1. **Metadata** (always loaded) - Brief description
2. **Main instructions** (loaded on trigger) - SKILL.md
3. **Reference docs** (loaded as needed) - Other .md files

This keeps token usage efficient while providing comprehensive documentation.

## External resources

All external links point to the Sisu GitHub repository:

- [Main repository](https://github.com/finger-gun/sisu)
- [Examples](https://github.com/finger-gun/sisu/tree/main/examples)
- [Middleware packages](https://github.com/finger-gun/sisu/tree/main/packages/middleware)
- [Tools packages](https://github.com/finger-gun/sisu/tree/main/packages/tools)

## Updating this skill

To update:

1. Pull latest Sisu docs from GitHub
2. Update relevant .md files
3. Test with your target agent environment
4. Redistribute to team

## Related

- **Sisu framework**: [github.com/finger-gun/sisu](https://github.com/finger-gun/sisu)
- **Agent Skills docs**: [platform.claude.com/docs/en/agents-and-tools/agent-skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- **Agent guide**: See `SISU_AGENT_GUIDE.md` in the repo root for a portable markdown guide
