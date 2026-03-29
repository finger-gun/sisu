import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  installSkill,
  resolveSkillTargetRoot,
} from '../src/chat/skill-install.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('skill install helpers', () => {
  test('resolves global and project roots', () => {
    expect(resolveSkillTargetRoot({ scope: 'global', homeDir: '/home/me' })).toBe('/home/me/.sisu/skills');
    expect(resolveSkillTargetRoot({ scope: 'project', cwd: '/repo' })).toBe('/repo/.sisu/skills');
    expect(resolveSkillTargetRoot({ dir: '/custom/skills' })).toBe('/custom/skills');
  });

  test('installs skill from local folder to project scope', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-skill-local-'));
    tempDirs.push(root);
    const source = path.join(root, 'source-skill');
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'SKILL.md'), [
      '---',
      'name: local-debug',
      'description: Local test skill',
      '---',
      '',
      '# Local debug',
    ].join('\n'));
    await fs.writeFile(path.join(source, 'README.md'), 'example');

    const result = await installSkill({
      packageOrPath: source,
      scope: 'project',
      cwd: root,
    });

    expect(result.skillId).toBe('local-debug');
    expect(result.sourceType).toBe('local');
    const copiedSkill = await fs.readFile(path.join(result.targetDir, 'SKILL.md'), 'utf8');
    expect(copiedSkill).toContain('name: local-debug');
  });

  test('official mode rejects non-namespace packages', async () => {
    await expect(installSkill({
      packageOrPath: 'left-pad',
      officialOnly: true,
    })).rejects.toThrow('E6601');
  });

  test('falls back to package name when SKILL.md frontmatter has no name', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-skill-fallback-'));
    tempDirs.push(root);
    const source = path.join(root, 'skill-awesome_tool');
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'SKILL.md'), '# No frontmatter\n');

    const result = await installSkill({
      packageOrPath: source,
      scope: 'project',
      cwd: root,
    });

    expect(result.skillId).toBe('awesome_tool');
    expect(result.sourceType).toBe('local');
    await expect(fs.access(path.join(result.targetDir, 'SKILL.md'))).resolves.toBeUndefined();
  });

  test('fails with E6702 when local skill is missing SKILL.md', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-skill-missing-md-'));
    tempDirs.push(root);
    const source = path.join(root, 'source-skill');
    await fs.mkdir(source, { recursive: true });

    await expect(installSkill({
      packageOrPath: source,
      scope: 'project',
      cwd: root,
    })).rejects.toThrow('E6702');
  });

  test('fails with E6704 when declared skill name normalizes to empty', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-skill-empty-name-'));
    tempDirs.push(root);
    const source = path.join(root, 'source-skill');
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'SKILL.md'), [
      '---',
      'name: "!!!"',
      'description: test',
      '---',
      '',
      '# bad',
    ].join('\n'));

    await expect(installSkill({
      packageOrPath: source,
      scope: 'project',
      cwd: root,
    })).rejects.toThrow('E6704');
  });
});
