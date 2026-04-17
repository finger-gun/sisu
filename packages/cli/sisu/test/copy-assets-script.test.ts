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
  test('copies templates, skill assets, and discovery metadata into dist', async () => {
    await import('../scripts/copy-assets.mjs');
    expect(rm).toHaveBeenCalledTimes(3);
    expect(mkdir).toHaveBeenCalledTimes(3);
    expect(cp).toHaveBeenCalledTimes(3);
  });
});
