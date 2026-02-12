# @sisu-ai/skill-code-review

Structured code review skill for safety, correctness, and maintainability.

Install

```bash
pnpm add @sisu-ai/skill-code-review
```

Usage

Point the skills middleware directly at the installed package:

```ts
skillsMiddleware({
  directories: ["node_modules/@sisu-ai/skill-code-review"],
});
```

Or copy the skill into your project skills directory (explicitly configured in middleware):

```bash
mkdir -p .sisu/skills/code-review
cp -R node_modules/@sisu-ai/skill-code-review/* .sisu/skills/code-review/
```

Resources

- `resources/review-checklist.md`

License

Apache-2.0
