# @sisu-ai/skill-repo-search

Codebase search skill for locating files, symbols, and patterns quickly.

Install

```bash
pnpm add @sisu-ai/skill-repo-search
```

Usage

Point the skills middleware directly at the installed package:

```ts
skillsMiddleware({
  directories: ["node_modules/@sisu-ai/skill-repo-search"],
});
```

Or copy the skill into your project skills directory:

```bash
mkdir -p .sisu/skills/repo-search
cp -R node_modules/@sisu-ai/skill-repo-search/* .sisu/skills/repo-search/
```

Resources

- `resources/search-cheatsheet.md`

License

Apache-2.0
