# Skills Guide

This guide covers authoring and using SKILL.md-based skills with SISU.

## Overview

SISU skills are filesystem modules defined by a `SKILL.md` file with YAML frontmatter and optional resources. The middleware discovers skills from explicitly configured directories and exposes a `use_skill` tool for activation.

Related design notes: `docs/design-topics/dt-20260212-1100-agent-skills-support.md`.

## Authoring a Skill

1. Create a directory for your skill.
2. Add a `SKILL.md` file with YAML frontmatter and markdown instructions.
3. Add optional resources under `resources/`.

Example layout:

```
skill-my-workflow/
  SKILL.md
  resources/
    checklist.md
```

## SKILL.md Format Requirements

Frontmatter uses a simple YAML subset (key/value pairs and arrays). The parser supports:

- `key: value`
- Inline arrays: `tags: [one, two]`
- Multiline arrays:
  - `tags:`
  - `  - one`
  - `  - two`

Required fields:

- `name`: skill id (kebab-case recommended)
- `description`: short summary for LLM matching

Recommended fields:

- `version`
- `author`
- `tags` (array)
- `requires` (array of tool names, e.g. `read_file`, `bash`)

Example:

```yaml
---
name: deploy
description: Safe production deploy checklist
version: 0.1.0
author: sisu
tags: [deploy, release]
requires: [read_file, bash]
---
```

## Bundling Resources

Put supporting files in `resources/` (or any subdirectory). The middleware will list resources with relative paths. Use these for:

- Checklists
- Templates
- Scripts
- Reference docs

Keep resources small. By default, the middleware caps file size and total skill size to avoid prompt bloat.

## Configuration Options

Use explicit directories (no implicit defaults):

```ts
skillsMiddleware({ directory: ".sisu/skills" });
```

Opt into ecosystem skills (skills.sh) by adding their directories explicitly:

```ts
skillsMiddleware({
  directories: [".sisu/skills", ".claude/skills"],
});
```

Filtering:

```ts
skillsMiddleware({
  directories: [".sisu/skills"],
  include: ["deploy", "code-review"],
});
```

## Tool Alias Compatibility

Many ecosystem skills expect snake_case tool names. Use aliases when registering tools:

```ts
registerTools(terminal.tools, {
  aliases: {
    terminalRun: "bash",
    terminalReadFile: "read_file",
    terminalCd: "cd",
  },
});
```

## Troubleshooting

- **No skills discovered**: Ensure you configured `directory` or `directories` and that each skill has a `SKILL.md` file.
- **Invalid frontmatter**: Only simple YAML is supported; remove complex syntax (anchors, block scalars).
- **Missing tools**: Add tool aliases that match `requires` entries in your SKILL.md.
- **Resource too large**: Reduce file size or adjust `maxFileSize`/`maxSkillSize` in middleware options.

## Ecosystem Skills (skills.sh)

Skills are compatible with the skills.sh ecosystem. You can install skills via:

```
npx skills add owner/repo/skill
```

Then include the skill directory in your middleware configuration.
