import { describe, expect, test } from 'vitest';
import { createInstallPlan, updateManagedSection } from '../src/lib.js';

describe('skill-install coverage', () => {
  test('covers additional target/scope roots', () => {
    expect(createInstallPlan({ target: 'cline', scope: 'workspace', cwd: '/repo', homeDir: '/home/u' }).skillDir)
      .toBe('/repo/.cline/skills/sisu-framework');

    expect(createInstallPlan({ target: 'roo-code', scope: 'workspace', cwd: '/repo', homeDir: '/home/u' }).skillDir)
      .toBe('/repo/.roo/skills/sisu-framework');

    expect(createInstallPlan({ target: 'windsurf', scope: 'global', cwd: '/repo', homeDir: '/home/u' }).skillDir)
      .toBe('/home/u/.codeium/windsurf/skills/sisu-framework');

    expect(createInstallPlan({ target: 'kilocode', scope: 'workspace', cwd: '/repo', homeDir: '/home/u' }).skillDir)
      .toBe('/repo/.kilocode/skills/sisu-framework');

    expect(createInstallPlan({ target: 'custom-skill-dir', scope: 'custom', customDir: '/tmp/custom', cwd: '/repo', homeDir: '/home/u' }).skillDir)
      .toBe('/tmp/custom/sisu-framework');
  });

  test('covers bridge adapters for copilot and codex', () => {
    const codex = createInstallPlan({ target: 'codex', scope: 'workspace', cwd: '/repo', homeDir: '/home/u' });
    expect(codex.adapterFile).toBe('/repo/AGENTS.md');
    expect(codex.adapterSection).toContain('Sisu Framework');

    const copilot = createInstallPlan({ target: 'copilot', scope: 'workspace', cwd: '/repo', homeDir: '/home/u' });
    expect(copilot.adapterFile).toBe('/repo/.github/copilot-instructions.md');
    expect(copilot.adapterSection).toContain('Preferred style:');
  });

  test('covers invalid scope and missing custom dir errors', () => {
    expect(() => createInstallPlan({ target: 'codex', scope: 'global', cwd: '/repo', homeDir: '/home/u' }))
      .toThrow('does not support global installs');

    expect(() => createInstallPlan({ target: 'custom-skill-dir', scope: 'custom', cwd: '/repo', homeDir: '/home/u' }))
      .toThrow('Custom directory is required');
  });

  test('updateManagedSection replaces existing managed block', () => {
    const initial = [
      'Intro',
      '<!-- sisu-framework:start -->',
      'Old',
      '<!-- sisu-framework:end -->',
      'Footer',
    ].join('\n');

    const updated = updateManagedSection(initial, 'sisu-framework', 'New Section');
    expect(updated).toContain('New Section');
    expect(updated).not.toContain('Old');
    expect(updated).toContain('Intro');
    expect(updated).toContain('Footer');
  });
});
