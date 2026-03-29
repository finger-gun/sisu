import { afterEach, describe, expect, test, vi } from 'vitest';

const rm = vi.fn(async () => undefined);
const mkdir = vi.fn(async () => undefined);
const cp = vi.fn(async () => undefined);
const readFile = vi.fn(async () => '');
const writeFile = vi.fn(async () => undefined);
const access = vi.fn(async () => undefined);

const createInstallPlan = vi.fn();
const installTargets = [
  {
    id: 'codex',
    label: 'Codex CLI',
    kind: 'codex-bridge',
    supports: ['workspace', 'custom'],
    notes: 'test',
  },
  {
    id: 'custom-skill-dir',
    label: 'Custom',
    kind: 'custom',
    supports: ['custom'],
  },
];

const updateManagedSection = vi.fn((existing: string, marker: string, section: string) => `${existing}\n${marker}\n${section}`);

vi.mock('node:fs/promises', () => ({
  default: { rm, mkdir, cp, readFile, writeFile, access },
  rm,
  mkdir,
  cp,
  readFile,
  writeFile,
  access,
}));

vi.mock('../src/lib.js', () => ({
  createInstallPlan,
  installTargets,
  updateManagedSection,
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  rm.mockClear();
  mkdir.mockClear();
  cp.mockClear();
  readFile.mockClear();
  writeFile.mockClear();
  access.mockClear();
  createInstallPlan.mockReset();
  updateManagedSection.mockClear();
});

function mockProcess(argv: string[]) {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const previousArgv = [...process.argv];
  process.argv = ['node', 'cli.js', ...argv];
  const restore = () => {
    process.argv = previousArgv;
  };
  return { logSpy, errSpy, restore };
}

describe('skill-install cli', () => {
  test('supports --list mode', async () => {
    const proc = mockProcess(['--list']);
    await import('../src/cli.ts');
    expect(proc.logSpy.mock.calls.some((call) => String(call[0]).includes('codex - Codex CLI'))).toBe(true);
    proc.logSpy.mockRestore();
    proc.errSpy.mockRestore();
    proc.restore();
  });

  test('installs from explicit args and writes managed adapter section', async () => {
    createInstallPlan.mockReturnValue({
      target: installTargets[0],
      scope: 'workspace',
      skillDir: '/repo/.sisu/skills/sisu-framework',
      adapterFile: '/repo/AGENTS.md',
      adapterSection: 'managed',
      summary: 'summary',
    });

    const proc = mockProcess(['--target', 'codex', '--scope', 'workspace', '--yes']);
    await import('../src/cli.ts');
    expect(createInstallPlan).toHaveBeenCalledWith(expect.objectContaining({
      target: 'codex',
      scope: 'workspace',
    }));
    expect(cp).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalled();
    expect(proc.logSpy.mock.calls.some((call) => String(call[0]).includes('Installed Sisu framework skill.'))).toBe(true);
    proc.logSpy.mockRestore();
    proc.errSpy.mockRestore();
    proc.restore();
  });

  test('reports fatal errors with non-zero exit', async () => {
    createInstallPlan.mockImplementation(() => {
      throw new Error('boom');
    });
    const proc = mockProcess(['--target', 'codex', '--scope', 'workspace', '--yes']);
    await expect(import('../src/cli.ts')).rejects.toThrow('boom');
    proc.logSpy.mockRestore();
    proc.errSpy.mockRestore();
    proc.restore();
  });
});
