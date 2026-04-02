import {
  loadDiscoveryCatalog,
  type DiscoveryCapabilityCategory,
  type DiscoveryCatalogEntry,
} from './chat/discovery-package.js';

export type CatalogCategory = DiscoveryCapabilityCategory;
export type CatalogEntry = DiscoveryCatalogEntry;

export const categories: CatalogCategory[] = [
  'libraries',
  'middleware',
  'tools',
  'adapters',
  'vector',
  'skills',
  'templates',
];

export const catalog: CatalogEntry[] = loadDiscoveryCatalog().entries
  .filter((entry) => categories.includes(entry.category))
  .slice()
  .sort((a, b) => {
    const categoryDiff = categories.indexOf(a.category) - categories.indexOf(b.category);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }
    return a.id.localeCompare(b.id);
  });
