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

  test('validates unsupported scopes and unknown targets', () => {
    expect(() =>
      createInstallPlan({
        target: 'cline',
        scope: 'global',
        cwd: '/repo',
        homeDir: '/home/user',
      }),
    ).toThrow(/does not support global installs/);

    expect(() =>
      createInstallPlan({
        target: 'nope' as any,
        scope: 'workspace',
        cwd: '/repo',
        homeDir: '/home/user',
      }),
    ).toThrow(/Unknown install target/);
  });

  test('builds custom and global plans for all supported target families', () => {
    const ws = createInstallPlan({
      target: 'windsurf',
      scope: 'workspace',
      cwd: '/repo',
      homeDir: '/home/user',
    });
    expect(ws.skillDir).toBe('/repo/.windsurf/skills/sisu-framework');

    const wg = createInstallPlan({
      target: 'windsurf',
      scope: 'global',
      cwd: '/repo',
      homeDir: '/home/user',
    });
    expect(wg.skillDir).toBe('/home/user/.codeium/windsurf/skills/sisu-framework');

    const kilo = createInstallPlan({
      target: 'kilocode',
      scope: 'global',
      cwd: '/repo',
      homeDir: '/home/user',
    });
    expect(kilo.skillDir).toBe('/home/user/.kilocode/skills/sisu-framework');

    const claudeCustom = createInstallPlan({
      target: 'claude-code',
      scope: 'custom',
      customDir: '/x/skills',
      cwd: '/repo',
      homeDir: '/home/user',
    });
    expect(claudeCustom.skillDir).toBe('/x/skills/sisu-framework');

    const custom = createInstallPlan({
      target: 'custom-skill-dir',
      scope: 'custom',
      customDir: '/opt/skills',
      cwd: '/repo',
      homeDir: '/home/user',
    });
    expect(custom.skillDir).toBe('/opt/skills/sisu-framework');
  });

  test('copilot plan wires .github/copilot-instructions.md with bridge section', () => {
    const plan = createInstallPlan({
      target: 'copilot',
      scope: 'workspace',
      cwd: '/repo',
      homeDir: '/home/user',
    });
    expect(plan.adapterFile).toBe('/repo/.github/copilot-instructions.md');
    expect(plan.adapterSection).toContain('Sisu Framework');
    expect(plan.adapterSection).toContain('.sisu/skills/sisu-framework');
  });

  test('custom target requires custom directory and updateManagedSection replaces existing block', () => {
    expect(() =>
      createInstallPlan({
        target: 'custom-skill-dir',
        scope: 'custom',
        cwd: '/repo',
        homeDir: '/home/user',
      }),
    ).toThrow(/Custom directory is required/);

    const existing = [
      'Top',
      '<!-- sisu-framework:start -->',
      'old',
      '<!-- sisu-framework:end -->',
      'Bottom',
    ].join('\n');
    const updated = updateManagedSection(existing, 'sisu-framework', 'new-body');
    expect(updated).toContain('new-body');
    expect(updated).not.toContain('\nold\n');
  });
});
