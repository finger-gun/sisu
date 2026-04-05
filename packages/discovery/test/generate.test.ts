import { describe, expect, test } from 'vitest';
import { validateCatalogEntry, validateRecipe } from '../scripts/validate.mjs';
import { catalogEntries, installRecipes, schemaVersion } from '../src/index.js';

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

  test('exports generated discovery catalog and recipes', () => {
    expect(schemaVersion).toBe(1);
    expect(catalogEntries.length).toBeGreaterThan(10);
    expect(catalogEntries.some((entry) => entry.id === 'core')).toBe(true);
    expect(catalogEntries.some((entry) => entry.id === 'tool-rag')).toBe(true);

    expect(installRecipes.length).toBeGreaterThan(0);
    expect(installRecipes.some((recipe) => recipe.id === 'rag-recommended')).toBe(true);
    expect(installRecipes.some((recipe) => recipe.id === 'rag-advanced')).toBe(true);
  });
});
