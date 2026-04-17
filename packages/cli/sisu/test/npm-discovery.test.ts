import { describe, expect, test, vi } from 'vitest';
import {
  listOfficialPackages,
  assertOfficialNamespacePackage,
  filterOfficialPackages,
  getDiscoveryDiagnostics,
  getOfficialPrefix,
  isOfficialNamespacePackage,
  setDiscoveryCatalogLoaderForTests,
} from '../src/chat/npm-discovery.js';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('@sisu-ai/discovery', () => ({
  catalogEntries: [
    {
      id: 'tool-terminal',
      category: 'tools',
      title: '@sisu-ai/tool-terminal',
      packageName: '@sisu-ai/tool-terminal',
      version: '9.9.9',
      summary: 'Terminal tool',
    },
    {
      id: 'rag',
      category: 'middleware',
      title: '@sisu-ai/mw-rag',
      packageName: '@sisu-ai/mw-rag',
      version: '8.8.8',
      summary: 'RAG middleware',
    },
    {
      id: 'skill-debug',
      category: 'skills',
      title: '@sisu-ai/skill-debug',
      packageName: '@sisu-ai/skill-debug',
      version: '7.7.7',
      summary: 'Debug skill',
    },
  ],
}));

vi.mock('../src/chat/discovery-package.js', () => ({
  loadDiscoveryCatalog: vi.fn(() => ({
    schemaVersion: 1,
    generatedAt: 'now',
    entries: [
      {
        id: 'skill-debug',
        category: 'skills',
        title: '@sisu-ai/skill-debug',
        packageName: '@sisu-ai/skill-debug',
        version: '7.7.7',
        summary: 'Debug skill',
      },
      {
        id: 'tool-terminal',
        category: 'tools',
        title: '@sisu-ai/tool-terminal',
        packageName: '@sisu-ai/tool-terminal',
        version: '9.9.9',
        summary: 'Terminal tool',
      },
    ],
  })),
}));

describe('npm discovery utilities', () => {
  test('sanity: mock is resettable between tests', () => {
    execFileMock.mockReset();
    setDiscoveryCatalogLoaderForTests(undefined);
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

  test('listOfficialPackages uses discovery catalog as primary source', async () => {
    setDiscoveryCatalogLoaderForTests(async () => [
      {
        id: 'skill-debug',
        category: 'skills',
        title: '@sisu-ai/skill-debug',
        packageName: '@sisu-ai/skill-debug',
        version: '7.7.7',
        summary: 'Debug skill',
      } as any,
    ]);
    const result = await listOfficialPackages('skills');
    expect(result).toEqual([
      { name: '@sisu-ai/skill-debug', version: '7.7.7', description: 'Debug skill' },
    ]);
    expect(execFileMock).toHaveBeenCalledTimes(0);
  });

  test('listOfficialPackages falls back to npm search when discovery import fails and fallback enabled', async () => {
    setDiscoveryCatalogLoaderForTests(async () => {
      throw new Error('boom');
    });
    execFileMock.mockImplementationOnce(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      cb(null, JSON.stringify([
        { name: '@sisu-ai/skill-debug', version: '1.0.0', description: 'debug' },
      ]));
      return undefined as any;
    }) as any);

    const result = await listOfficialPackages('skills', { allowNpmFallback: true });
    expect(result).toEqual([{ name: '@sisu-ai/skill-debug', version: '1.0.0', description: 'debug' }]);
    expect(getDiscoveryDiagnostics().some((line) => line.includes('fallback'))).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      'npm',
      ['search', '--json', '--searchlimit', '250', '@sisu-ai/skill-'],
      expect.objectContaining({ maxBuffer: 1024 * 1024 * 8 }),
      expect.any(Function),
    );
  });

  test('listOfficialPackages returns empty list for non-array JSON and rejects command errors', async () => {
    setDiscoveryCatalogLoaderForTests(async () => {
      throw new Error('offline');
    });
    execFileMock.mockImplementationOnce(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      cb(null, JSON.stringify({ unexpected: true }));
      return undefined as any;
    }) as any);
    await expect(listOfficialPackages('tools', { allowNpmFallback: true })).resolves.toEqual([]);

    execFileMock.mockImplementationOnce(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (error: Error | null, stdout: string) => void,
    ) => {
      cb(new Error('npm failed'), '');
      return undefined as any;
    }) as any);
    await expect(listOfficialPackages('middleware', { allowNpmFallback: true })).rejects.toThrow('npm failed');
  });
});
