import { describe, expect, test } from 'vitest';
import { createInstallPlan, updateManagedSection } from '../src/lib.js';

describe('sisu-skill-install', () => {
  test('creates codex install plan with AGENTS bridge', () => {
    const plan = createInstallPlan({
      target: 'codex',
      scope: 'workspace',
      cwd: '/repo',
      homeDir: '/home/user',
    });

    expect(plan.skillDir).toBe('/repo/.sisu/skills/sisu-framework');
    expect(plan.adapterFile).toBe('/repo/AGENTS.md');
    expect(plan.adapterSection).toContain('.sisu/skills/sisu-framework/SKILL.md');
  });

  test('creates claude global install plan', () => {
    const plan = createInstallPlan({
      target: 'claude-code',
      scope: 'global',
      cwd: '/repo',
      homeDir: '/home/user',
    });

    expect(plan.skillDir).toBe('/home/user/.claude/skills/sisu-framework');
    expect(plan.adapterFile).toBeUndefined();
  });

  test('upserts managed section without removing user content', () => {
    const updated = updateManagedSection('Intro', 'sisu-framework', 'Body');
    expect(updated).toContain('Intro');
    expect(updated).toContain('<!-- sisu-framework:start -->');
    expect(updated).toContain('Body');
  });
});
