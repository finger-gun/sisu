import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export type DiscoveryCapabilityCategory =
  | 'libraries'
  | 'middleware'
  | 'tools'
  | 'adapters'
  | 'vector'
  | 'skills'
  | 'templates';

export interface DiscoveryCatalogEntry {
  id: string;
  category: DiscoveryCapabilityCategory;
  title: string;
  packageName?: string;
  version?: string;
  summary: string;
  docsPath?: string;
  examples?: string[];
  tags?: string[];
  aliases?: string[];
}

export type DiscoveryRecipeInstallType = 'tool' | 'middleware' | 'package';

export interface DiscoveryInstallRecipe {
  id: string;
  label: string;
  description: string;
  kind: 'package' | 'bundle';
  category: 'tools' | 'middleware';
  installs: Array<{ type: DiscoveryRecipeInstallType; name: string }>;
  choices?: Array<{
    id: string;
    label: string;
    options: Array<{ id: string; label: string; description?: string; packageName?: string }>;
    allowCustomPackage?: boolean;
  }>;
  postInstall: Array<
    | { kind: 'enableCapability'; id: string; type: 'tool' | 'middleware' }
    | { kind: 'setConfig'; scope: 'tool' | 'middleware'; id: string; config: Record<string, unknown> }
  >;
}

interface CatalogPayload {
  schemaVersion: number;
  generatedAt: string;
  entries: DiscoveryCatalogEntry[];
}

interface RecipePayload {
  schemaVersion: number;
  generatedAt: string;
  recipes: DiscoveryInstallRecipe[];
}

let cachedCatalog: CatalogPayload | undefined;
let cachedRecipes: RecipePayload | undefined;

function resolveDiscoveryJsonPath(fileName: 'catalog.json' | 'recipes.json'): string {
  const require = createRequire(import.meta.url);
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve('@sisu-ai/discovery/package.json');
  } catch {
    const localFallback = path.resolve(process.cwd(), 'packages', 'discovery', 'package.json');
    if (!fs.existsSync(localFallback)) {
      throw new Error('Unable to resolve @sisu-ai/discovery package.');
    }
    packageJsonPath = localFallback;
  }
  const packageRoot = path.dirname(packageJsonPath);
  return path.join(packageRoot, 'src', 'generated', fileName);
}

function readJsonFile<T>(fileName: 'catalog.json' | 'recipes.json'): T {
  const filePath = resolveDiscoveryJsonPath(fileName);
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export function loadDiscoveryCatalog(): CatalogPayload {
  if (!cachedCatalog) {
    cachedCatalog = readJsonFile<CatalogPayload>('catalog.json');
  }
  return cachedCatalog;
}

export function loadDiscoveryRecipes(): RecipePayload {
  if (!cachedRecipes) {
    cachedRecipes = readJsonFile<RecipePayload>('recipes.json');
  }
  return cachedRecipes;
}

export function resetDiscoveryCacheForTests(): void {
  cachedCatalog = undefined;
  cachedRecipes = undefined;
}
