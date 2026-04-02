import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { discoverConfiguredSkills, getDefaultSkillDirectories } from '../src/chat/skills.js';
import { discoverSkills } from '@sisu-ai/mw-skills';

vi.mock('@sisu-ai/mw-skills', () => ({
  discoverSkills: vi.fn(),
}));

const discoverSkillsMock = vi.mocked(discoverSkills);

afterEach(() => {
  vi.restoreAllMocks();
  discoverSkillsMock.mockReset();
});

describe('chat skills discovery', () => {
  test('getDefaultSkillDirectories resolves project and global paths', () => {
    const dirs = getDefaultSkillDirectories('/repo', '/home/dev');
    expect(dirs).toEqual({
      globalDir: '/home/dev/.sisu/skills',
      projectDir: '/repo/.sisu/skills',
      bundledInstallerDir: expect.stringContaining(path.join('assets', 'skills', 'installer')),
    });
  });

  test('discoverConfiguredSkills returns empty result when no skills discovered', async () => {
    discoverSkillsMock.mockResolvedValue({ skills: [], errors: [] } as any);
    const result = await discoverConfiguredSkills([]);
    expect(result).toEqual({ skills: [], diagnostics: [] });
    expect(discoverSkillsMock).toHaveBeenCalledTimes(1);
  });

  test('discoverConfiguredSkills maps source and prefers project skill over global duplicate', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/dev');
    discoverSkillsMock.mockResolvedValue({
      skills: [
        {
          metadata: { name: 'debug', description: 'global debug' },
          directory: '/home/dev/.sisu/skills/debug',
        },
        {
          metadata: { name: 'debug', description: 'project debug' },
          directory: '/repo/.sisu/skills/debug',
        },
        {
          metadata: { name: 'custom-tool', description: '' },
          directory: '/custom/skills/custom-tool',
        },
      ],
      errors: [{ path: '/broken/skills', error: 'Permission denied' }],
    } as any);

    const result = await discoverConfiguredSkills(
      ['/repo/.sisu/skills', '/home/dev/.sisu/skills', '/custom/skills'],
      '/repo',
    );

    expect(result.skills).toEqual([
      {
        id: 'debug',
        description: 'project debug',
        source: 'project',
        directory: '/repo/.sisu/skills/debug',
      },
      {
        id: 'custom-tool',
        description: '',
        source: 'custom',
        directory: '/custom/skills/custom-tool',
      },
    ]);
    expect(result.diagnostics).toEqual([
      { path: '/broken/skills', error: 'Permission denied' },
    ]);
  });
});
