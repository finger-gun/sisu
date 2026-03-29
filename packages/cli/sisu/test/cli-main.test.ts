import { describe, expect, test, vi } from 'vitest';
import { runCli, runCliEntrypoint } from '../src/cli-main.js';

describe('cli main', () => {
  test('prints version', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--version']);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^0\.\d+\.\d+/));
    log.mockRestore();
  });

  test('list emits JSON with --json', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runCli(['--json', 'list', 'tools']);
    expect(log.mock.calls.some((call) => String(call[0]).includes('"id"'))).toBe(true);
    log.mockRestore();
  });

  test('unknown command returns coded non-zero in entrypoint', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['wat']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1000'))).toBe(true);
    err.mockRestore();
  });

  test('install usage validation returns E1101', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const code = await runCliEntrypoint(['install', 'nope']);
    expect(code).toBe(2);
    expect(err.mock.calls.some((call) => String(call[0]).includes('E1101'))).toBe(true);
    err.mockRestore();
  });
});
