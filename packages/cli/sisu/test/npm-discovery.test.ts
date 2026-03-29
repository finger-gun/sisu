import { describe, expect, test, vi } from 'vitest';
import {
  listOfficialPackages,
  assertOfficialNamespacePackage,
  filterOfficialPackages,
  getOfficialPrefix,
  isOfficialNamespacePackage,
} from '../src/chat/npm-discovery.js';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

describe('npm discovery utilities', () => {
  test('sanity: mock is resettable between tests', () => {
    execFileMock.mockReset();
    expect(execFileMock).toHaveBeenCalledTimes(0);
  });

  test('official namespace checks and assertions', () => {
    expect(isOfficialNamespacePackage('@sisu-ai/tool-terminal')).toBe(true);
    expect(isOfficialNamespacePackage('@other/tool-terminal')).toBe(false);
    expect(() => assertOfficialNamespacePackage('@sisu-ai/skill-debug')).not.toThrow();
    expect(() => assertOfficialNamespacePackage('skill-debug')).toThrow('E6601');
  });

  test('prefix lookup and filtering dedupe by category', () => {
    expect(getOfficialPrefix('middleware')).toBe('@sisu-ai/mw-');
    expect(getOfficialPrefix('tools')).toBe('@sisu-ai/tool-');
    expect(getOfficialPrefix('skills')).toBe('@sisu-ai/skill-');

    const filtered = filterOfficialPackages('tools', [
      { name: '@sisu-ai/tool-web-fetch', version: '1.0.0', description: 'fetch' },
      { name: '@sisu-ai/tool-web-fetch', version: '1.0.1', description: 'dup ignored' },
      { name: '@sisu-ai/mw-rag', version: '1.0.0', description: 'wrong type' },
      { name: '@sisu-ai/tool-terminal' },
      {},
    ]);

    expect(filtered).toEqual([
      { name: '@sisu-ai/tool-terminal', version: 'unknown', description: '' },
      { name: '@sisu-ai/tool-web-fetch', version: '1.0.0', description: 'fetch' },
    ]);
  });

  test('listOfficialPackages invokes npm search and filters by category prefix', async () => {
    execFileMock.mockImplementationOnce(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      cb(null, JSON.stringify([
        { name: '@sisu-ai/skill-debug', version: '1.0.0', description: 'debug' },
        { name: '@sisu-ai/skill-debug', version: '1.0.1', description: 'duplicate' },
        { name: '@sisu-ai/tool-terminal', version: '1.2.3', description: 'wrong category' },
      ]));
      return undefined as any;
    }) as any);

    const result = await listOfficialPackages('skills');
    expect(result).toEqual([
      { name: '@sisu-ai/skill-debug', version: '1.0.0', description: 'debug' },
    ]);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      ['search', '--json', '@sisu-ai/skill-'],
      expect.objectContaining({ maxBuffer: 1024 * 1024 * 4 }),
      expect.any(Function),
    );
  });

  test('listOfficialPackages returns empty list for non-array JSON and rejects command errors', async () => {
    execFileMock.mockImplementationOnce(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      cb(null, JSON.stringify({ unexpected: true }));
      return undefined as any;
    }) as any);
    await expect(listOfficialPackages('tools')).resolves.toEqual([]);

    execFileMock.mockImplementationOnce(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      cb(new Error('npm failed'), '');
      return undefined as any;
    }) as any);
    await expect(listOfficialPackages('middleware')).rejects.toThrow('npm failed');
  });
});
