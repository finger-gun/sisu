# @sisu-ai/skill-explain

Explanation skill for code and architecture walkthroughs.

Install

```bash
pnpm add @sisu-ai/skill-explain
```

Usage

Point the skills middleware directly at the installed package:

```ts
skillsMiddleware({
  directories: ["node_modules/@sisu-ai/skill-explain"],
});
```

Or copy the skill into your project skills directory:

```bash
mkdir -p .sisu/skills/explain
cp -R node_modules/@sisu-ai/skill-explain/* .sisu/skills/explain/
```

Resources

- `resources/explanation-template.md`

License

Apache-2.0
