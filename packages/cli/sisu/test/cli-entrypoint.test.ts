import { describe, expect, test, vi } from 'vitest';

const runCliEntrypointMock = vi.fn(async () => 7);

vi.mock('../src/cli-main.js', () => ({
  runCliEntrypoint: runCliEntrypointMock,
}));

describe('cli entrypoint', () => {
  test('sets process.exitCode from runCliEntrypoint result', async () => {
    const previous = process.exitCode;
    process.exitCode = undefined;
    await import('../src/cli.ts');
    await Promise.resolve();
    expect(runCliEntrypointMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(7);
    process.exitCode = previous;
  });
});
