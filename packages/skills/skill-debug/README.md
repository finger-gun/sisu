# @sisu-ai/skill-debug

Debugging skill with a systematic playbook.

Install

```bash
pnpm add @sisu-ai/skill-debug
```

Usage

Point the skills middleware directly at the installed package:

```ts
skillsMiddleware({
  directories: ["node_modules/@sisu-ai/skill-debug"],
});
```

Or copy the skill into your project skills directory:

```bash
mkdir -p .sisu/skills/debug
cp -R node_modules/@sisu-ai/skill-debug/* .sisu/skills/debug/
```

Resources

- `resources/debug-playbook.md`

License

Apache-2.0
