import { describe, expect, test } from 'vitest';
import config from '../../../eslint.config.js';

describe('eslint config', () => {
  test('exports expected flat config shape', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);

    const tsBlock = config.find((entry: any) => Array.isArray(entry?.files) && entry.files.includes('**/*.ts')) as any;
    expect(tsBlock).toBeDefined();
    expect(tsBlock.languageOptions?.parserOptions?.ecmaVersion).toBe(2024);
    expect(tsBlock.rules['@typescript-eslint/no-unused-vars']).toBeDefined();
  });
});
