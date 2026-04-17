import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalogEntry, validateRecipe, ensureValidPackageName } from './validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const packagesRoot = path.join(repoRoot, 'packages');
const outputDir = path.join(packageRoot, 'src', 'generated');
const schemaVersion = 1;

const CATEGORIES = [
  'libraries',
  'middleware',
  'tools',
  'adapters',
  'vector',
  'skills',
  'templates',
];

const CATEGORY_ORDER = new Map(CATEGORIES.map((category, index) => [category, index]));

function stableSortEntries(entries) {
  return entries.sort((left, right) => {
    const catDiff = (CATEGORY_ORDER.get(left.category) ?? 99) - (CATEGORY_ORDER.get(right.category) ?? 99);
    if (catDiff !== 0) return catDiff;
    return left.id.localeCompare(right.id);
  });
}

function withDefaults(value, fallback) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function normalizeIdForPackage(packageName, category) {
  const raw = packageName.replace(/^@sisu-ai\//, '');
  if (category === 'middleware') return raw.replace(/^mw-/, '');
  if (category === 'tools' || category === 'skills' || category === 'adapters' || category === 'vector') return raw;
  return raw;
}

function inferCategory(packageName) {
  if (packageName.startsWith('@sisu-ai/tool-')) return 'tools';
  if (packageName.startsWith('@sisu-ai/mw-')) return 'middleware';
  if (packageName.startsWith('@sisu-ai/skill-')) return 'skills';
  if (packageName.startsWith('@sisu-ai/adapter-')) return 'adapters';
  if (packageName.startsWith('@sisu-ai/vector-')) return 'vector';
  if (
    packageName === '@sisu-ai/core'
    || packageName === '@sisu-ai/server'
    || packageName === '@sisu-ai/rag-core'
  ) {
    return 'libraries';
  }
  return undefined;
}

async function listPackageJsonPaths() {
  const levelOne = await fs.readdir(packagesRoot, { withFileTypes: true });
  const packageJsonPaths = [];

  for (const entry of levelOne) {
    if (!entry.isDirectory()) continue;
    const firstPath = path.join(packagesRoot, entry.name);
    const maybePackageJson = path.join(firstPath, 'package.json');
    try {
      await fs.access(maybePackageJson);
      packageJsonPaths.push(maybePackageJson);
    } catch {
      // noop
    }
    const levelTwo = await fs.readdir(firstPath, { withFileTypes: true });
    for (const child of levelTwo) {
      if (!child.isDirectory()) continue;
      const maybeNestedPackageJson = path.join(firstPath, child.name, 'package.json');
      try {
        await fs.access(maybeNestedPackageJson);
        packageJsonPaths.push(maybeNestedPackageJson);
      } catch {
        // noop
      }
    }
  }
  return packageJsonPaths.sort();
}

function packageRootFromPackageJson(packageJsonPath) {
  return path.dirname(packageJsonPath);
}

function docsPathForPackage(packageJsonPath) {
  const relative = path.relative(repoRoot, packageJsonPath).replace(/\\/g, '/');
  return relative.replace(/package\.json$/, 'README.md');
}

async function maybeCollectExamples(packageName) {
  const examplesRoot = path.join(repoRoot, 'examples');
  let entries = [];
  try {
    entries = await fs.readdir(examplesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const needle = packageName.replace('@sisu-ai/', '');
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.includes(needle.split('-')[0])) continue;
    const readme = `examples/${entry.name}/README.md`;
    matches.push(readme);
  }
  return matches.sort();
}

async function summaryFromReadme(packageJsonPath) {
  const readmePath = docsPathForPackage(packageJsonPath);
  const absolute = path.join(repoRoot, readmePath);
  try {
    const content = await fs.readFile(absolute, 'utf8');
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('['));
    return lines[0];
  } catch {
    return undefined;
  }
}

function fallbackSummaryFromKeywords(keywords, category) {
  const parts = Array.isArray(keywords) ? keywords.filter((item) => typeof item === 'string') : [];
  if (parts.length > 0) {
    return `${parts.slice(0, 4).join(', ')} ${category}`.trim();
  }
  return `${category} package`;
}

function buildAliases(packageName, id, category) {
  const aliases = new Set([id, packageName.replace('@sisu-ai/', '')]);
  const stripped = packageName.replace('@sisu-ai/', '');
  if (category === 'tools') aliases.add(stripped.replace(/^tool-/, ''));
  if (category === 'middleware') aliases.add(stripped.replace(/^mw-/, ''));
  if (category === 'skills') aliases.add(stripped.replace(/^skill-/, ''));
  if (category === 'adapters') aliases.add(stripped.replace(/^adapter-/, ''));
  if (category === 'vector') aliases.add(stripped.replace(/^vector-/, ''));
  return [...aliases].filter(Boolean);
}

function buildRecipes() {
  return [
    {
      id: 'rag-recommended',
      label: 'RAG (Recommended)',
      description: 'Install tool-rag + mw-rag with vector-vectra defaults.',
      kind: 'bundle',
      category: 'middleware',
      installs: [
        { type: 'tool', name: '@sisu-ai/tool-rag' },
        { type: 'middleware', name: '@sisu-ai/mw-rag' },
        { type: 'package', name: '@sisu-ai/vector-vectra' },
      ],
      postInstall: [
        { kind: 'enableCapability', id: 'tool-rag', type: 'tool' },
        { kind: 'enableCapability', id: 'rag', type: 'middleware' },
        { kind: 'setConfig', scope: 'tool', id: 'tool-rag', config: { backend: 'vectra' } },
        { kind: 'setConfig', scope: 'middleware', id: 'rag', config: { backend: 'vectra' } },
      ],
    },
    {
      id: 'rag-advanced',
      label: 'RAG (Advanced)',
      description: 'Install RAG stack with selectable vector backend.',
      kind: 'bundle',
      category: 'middleware',
      installs: [
        { type: 'tool', name: '@sisu-ai/tool-rag' },
        { type: 'middleware', name: '@sisu-ai/mw-rag' },
      ],
      choices: [
        {
          id: 'vector-backend',
          label: 'Vector backend',
          allowCustomPackage: true,
          options: [
            {
              id: 'vectra',
              label: 'Vectra (local)',
              packageName: '@sisu-ai/vector-vectra',
              description: 'Local file-backed vector store.',
            },
            {
              id: 'chroma',
              label: 'Chroma',
              packageName: '@sisu-ai/vector-chroma',
              description: 'Chroma-backed vector store.',
            },
            {
              id: 'custom',
              label: 'Custom package',
              description: 'Provide a custom vector package name.',
            },
          ],
        },
      ],
      postInstall: [
        { kind: 'enableCapability', id: 'tool-rag', type: 'tool' },
        { kind: 'enableCapability', id: 'rag', type: 'middleware' },
      ],
    },
  ];
}

async function generate() {
  const packageJsonPaths = await listPackageJsonPaths();
  const catalogEntries = [];

  for (const packageJsonPath of packageJsonPaths) {
    const content = await fs.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content);
    const packageName = pkg.name;
    if (typeof packageName !== 'string' || !packageName.startsWith('@sisu-ai/')) {
      continue;
    }
    if (packageName === '@sisu-ai/cli' || packageName === '@sisu-ai/discovery') {
      continue;
    }
    const category = inferCategory(packageName);
    if (!category) {
      continue;
    }
    ensureValidPackageName(packageName);
    const id = normalizeIdForPackage(packageName, category);
    const readmeSummary = await summaryFromReadme(packageJsonPath);
    const summary = withDefaults(
      pkg.description || readmeSummary,
      fallbackSummaryFromKeywords(pkg.keywords, category),
    );
    const docsPath = docsPathForPackage(packageJsonPath);
    const examples = await maybeCollectExamples(packageName);
    const keywords = Array.isArray(pkg.keywords)
      ? pkg.keywords.filter((item) => typeof item === 'string').slice(0, 8)
      : [];

    catalogEntries.push({
      id,
      category,
      title: packageName,
      packageName,
      version: withDefaults(pkg.version, '0.0.0'),
      summary,
      docsPath,
      examples,
      tags: keywords,
      aliases: buildAliases(packageName, id, category),
    });

    const packageRoot = packageRootFromPackageJson(packageJsonPath);
    await fs.access(packageRoot);
  }

  const templates = [
    {
      id: 'chat-agent',
      category: 'templates',
      title: 'chat-agent',
      summary: 'Minimal conversational agent starter with tracing.',
      tags: ['template', 'chat'],
      aliases: ['chat'],
    },
    {
      id: 'cli-agent',
      category: 'templates',
      title: 'cli-agent',
      summary: 'Single-shot CLI agent starter that takes prompt input from argv.',
      tags: ['template', 'cli'],
      aliases: ['cli'],
    },
    {
      id: 'rag-agent',
      category: 'templates',
      title: 'rag-agent',
      summary: 'Local Vectra-backed RAG starter using rag-core and tool-rag.',
      tags: ['template', 'rag', 'vectra'],
      aliases: ['rag'],
    },
  ];

  const entries = stableSortEntries([...catalogEntries, ...templates]);
  for (const entry of entries) {
    validateCatalogEntry(entry);
  }

  const recipes = buildRecipes();
  for (const recipe of recipes) {
    validateRecipe(recipe);
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'catalog.json'),
    `${JSON.stringify({
      schemaVersion,
      generatedAt: new Date().toISOString(),
      entries,
    }, null, 2)}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(outputDir, 'recipes.json'),
    `${JSON.stringify({
      schemaVersion,
      generatedAt: new Date().toISOString(),
      recipes,
    }, null, 2)}\n`,
    'utf8',
  );
}

generate().catch((error) => {
  process.stderr.write(`Discovery generation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
