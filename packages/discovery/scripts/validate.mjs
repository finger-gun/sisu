const CATEGORY_VALUES = new Set([
  'libraries',
  'middleware',
  'tools',
  'adapters',
  'vector',
  'skills',
  'templates',
]);

export function ensureValidPackageName(packageName) {
  if (!/^@sisu-ai\/[a-z0-9-]+$/.test(packageName)) {
    throw new Error(`Invalid package name '${packageName}' for discovery catalog.`);
  }
}

export function validateCatalogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Catalog entry must be an object.');
  }
  if (!entry.id || typeof entry.id !== 'string') {
    throw new Error(`Invalid catalog entry id: ${JSON.stringify(entry)}`);
  }
  if (!CATEGORY_VALUES.has(entry.category)) {
    throw new Error(`Invalid catalog category '${entry.category}' for '${entry.id}'.`);
  }
  if (entry.packageName) {
    ensureValidPackageName(entry.packageName);
  }
  if (!entry.summary || typeof entry.summary !== 'string') {
    throw new Error(`Missing summary for '${entry.id}'.`);
  }
}

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    throw new Error('Recipe must be an object.');
  }
  if (!recipe.id || !recipe.label || !Array.isArray(recipe.installs) || !Array.isArray(recipe.postInstall)) {
    throw new Error(`Invalid discovery recipe: ${JSON.stringify(recipe)}`);
  }
  for (const step of recipe.installs) {
    if (!step.type || !step.name) {
      throw new Error(`Invalid install step in recipe '${recipe.id}'.`);
    }
  }
}

