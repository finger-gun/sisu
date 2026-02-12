# @sisu-ai/skill-test-gen

Test generation skill for Vitest with coverage guidance.

Install

```bash
pnpm add @sisu-ai/skill-test-gen
```

Usage

Point the skills middleware directly at the installed package:

```ts
skillsMiddleware({
  directories: ["node_modules/@sisu-ai/skill-test-gen"],
});
```

Or copy the skill into your project skills directory:

```bash
mkdir -p .sisu/skills/test-gen
cp -R node_modules/@sisu-ai/skill-test-gen/* .sisu/skills/test-gen/
```

Resources

- `resources/vitest-patterns.md`

License

Apache-2.0
