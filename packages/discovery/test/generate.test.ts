import { describe, expect, test } from 'vitest';
import { validateCatalogEntry, validateRecipe } from '../scripts/validate.mjs';

describe('discovery generation validation', () => {
  test('validates malformed catalog entries', () => {
    expect(() => validateCatalogEntry({ id: '', category: 'tools', summary: 'x' })).toThrow();
    expect(() => validateCatalogEntry({ id: 'ok', category: 'bad', summary: 'x' })).toThrow();
    expect(() => validateCatalogEntry({ id: 'ok', category: 'tools', packageName: 'bad/pkg', summary: 'x' })).toThrow();
  });

  test('validates malformed recipes', () => {
    expect(() => validateRecipe({ id: 'x', installs: [] })).toThrow();
    expect(() => validateRecipe({ id: 'x', label: 'x', installs: [{}], postInstall: [] })).toThrow();
    expect(() => validateRecipe({ id: 'ok', label: 'ok', installs: [{ type: 'tool', name: '@sisu-ai/tool-rag' }], postInstall: [] })).not.toThrow();
  });
});

