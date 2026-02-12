# @sisu-ai/skill-deploy

Deployment skill with safety checks and rollback guidance.

Install

```bash
pnpm add @sisu-ai/skill-deploy
```

Usage

Point the skills middleware directly at the installed package:

```ts
skillsMiddleware({
  directories: ["node_modules/@sisu-ai/skill-deploy"],
});
```

Or copy into your skills directory and configure middleware to scan it:

```bash
mkdir -p .sisu/skills/deploy
cp -R node_modules/@sisu-ai/skill-deploy/* .sisu/skills/deploy/
```

Resources

- `resources/deploy-checklist.md`
- `resources/rollback.md`

License

Apache-2.0
