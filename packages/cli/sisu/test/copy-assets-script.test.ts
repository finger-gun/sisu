import { afterEach, describe, expect, test, vi } from 'vitest';

const rm = vi.fn(async () => undefined);
const mkdir = vi.fn(async () => undefined);
const cp = vi.fn(async () => undefined);

vi.mock('node:fs/promises', () => ({
  default: { rm, mkdir, cp },
  rm,
  mkdir,
  cp,
}));

afterEach(() => {
  vi.resetModules();
  rm.mockClear();
  mkdir.mockClear();
  cp.mockClear();
});

describe('cli copy-assets script', () => {
  test('copies templates into dist', async () => {
    await import('../scripts/copy-assets.mjs');
    expect(rm).toHaveBeenCalledTimes(1);
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(cp).toHaveBeenCalledTimes(1);
  });
});
