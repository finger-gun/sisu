import catalogData from './generated/catalog.json' with { type: 'json' };
import recipesData from './generated/recipes.json' with { type: 'json' };
import {
  DISCOVERY_SCHEMA_VERSION,
  type DiscoveryCatalogEntry,
  type DiscoveryInstallRecipe,
} from './schema.js';

interface GeneratedCatalogPayload {
  schemaVersion: number;
  generatedAt: string;
  entries: DiscoveryCatalogEntry[];
}

interface GeneratedRecipePayload {
  schemaVersion: number;
  generatedAt: string;
  recipes: DiscoveryInstallRecipe[];
}

const catalogPayload = catalogData as GeneratedCatalogPayload;
const recipesPayload = recipesData as GeneratedRecipePayload;

if (catalogPayload.schemaVersion !== DISCOVERY_SCHEMA_VERSION) {
  throw new Error(
    `Discovery catalog schema mismatch: expected ${DISCOVERY_SCHEMA_VERSION}, got ${catalogPayload.schemaVersion}`,
  );
}

if (recipesPayload.schemaVersion !== DISCOVERY_SCHEMA_VERSION) {
  throw new Error(
    `Discovery recipes schema mismatch: expected ${DISCOVERY_SCHEMA_VERSION}, got ${recipesPayload.schemaVersion}`,
  );
}

export const schemaVersion = DISCOVERY_SCHEMA_VERSION;
export const catalogGeneratedAt = catalogPayload.generatedAt;
export const recipesGeneratedAt = recipesPayload.generatedAt;
export const catalogEntries: DiscoveryCatalogEntry[] = catalogPayload.entries;
export const installRecipes: DiscoveryInstallRecipe[] = recipesPayload.recipes;

export * from './schema.js';

