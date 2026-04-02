import fs from 'node:fs/promises';
import path from 'node:path';
import { catalog, categories, type CatalogCategory, type CatalogEntry } from './catalog.js';
export * from './chat/events.js';
export * from './chat/markdown.js';
export * from './chat/npm-discovery.js';
export * from './chat/profiles.js';
export * from './chat/renderer.js';
export * from './chat/runtime.js';
export * from './chat/session-store.js';
export * from './chat/skill-install.js';
export * from './chat/capability-install.js';
export * from './chat/state.js';
export * from './chat/tool-policy.js';
export {
  getMiddlewareConfigDescriptor,
  getMiddlewareCatalogEntry,
  getLockedCoreMiddlewareIds,
  isLockedCoreMiddleware,
  validateMiddlewareConfig,
} from './chat/middleware/catalog.js';
export {
  BUILTIN_TOOL_CAPABILITIES,
  buildCapabilityRegistry,
  describeCapabilitySource,
  enforceLockedCoreMiddleware,
  isLockedMiddlewareCapability,
  isMiddlewareCapability,
  resolveCapabilityState,
} from './chat/capabilities.js';
export * from './cli-main.js';

export function listCategory(category: CatalogCategory): CatalogEntry[] {
  return catalog.filter((entry) => entry.category === category);
}

export function resolveEntry(name: string): CatalogEntry | undefined {
  const normalized = name.trim().toLowerCase();
  return catalog.find((entry) => {
    const haystack = [entry.id, entry.title, entry.packageName, ...(entry.aliases || [])]
      .filter(Boolean)
      .map((value) => value!.toLowerCase());
    return haystack.includes(normalized);
  });
}

export function formatList(entries: CatalogEntry[]): string {
  return entries
    .map((entry) => `- ${entry.id} — ${entry.summary}${entry.packageName ? ` (${entry.packageName})` : ''}`)
    .join('\n');
}

export function formatInfo(entry: CatalogEntry): string {
  const lines = [
    `Name: ${entry.title}`,
    `Category: ${entry.category}`,
    `Id: ${entry.id}`,
  ];
  if (entry.packageName) lines.push(`Package: ${entry.packageName}`);
  lines.push(`Summary: ${entry.summary}`);
  if (entry.docsPath) lines.push(`Docs: ${entry.docsPath}`);
  if (entry.examples && entry.examples.length > 0) {
    lines.push(`Examples: ${entry.examples.join(', ')}`);
  }
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`Tags: ${entry.tags.join(', ')}`);
  }
  if (entry.aliases && entry.aliases.length > 0) {
    lines.push(`Aliases: ${entry.aliases.join(', ')}`);
  }
  return lines.join('\n');
}

export function getTemplateIds(): string[] {
  return listCategory('templates').map((entry) => entry.id);
}

export function renderTemplate(content: string, projectName: string): string {
  return content.replaceAll('{{PROJECT_NAME}}', projectName);
}

export async function scaffoldTemplate(options: {
  templateId: string;
  projectName: string;
  destinationRoot?: string;
  templateRoot: string;
}): Promise<string> {
  const destinationRoot = path.resolve(options.destinationRoot || process.cwd());
  const templateDir = path.join(options.templateRoot, options.templateId);
  const destinationDir = path.join(destinationRoot, options.projectName);

  await fs.mkdir(destinationDir, { recursive: false });

  const copyRecursive = async (sourceDir: string, targetDir: string) => {
    await fs.mkdir(targetDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetName = entry.name.endsWith('.tpl') ? entry.name.slice(0, -4) : entry.name;
      const targetPath = path.join(targetDir, targetName);
      if (entry.isDirectory()) {
        await copyRecursive(sourcePath, targetPath);
      } else {
        const content = await fs.readFile(sourcePath, 'utf8');
        await fs.writeFile(targetPath, renderTemplate(content, options.projectName));
      }
    }
  };

  await copyRecursive(templateDir, destinationDir);
  return destinationDir;
}

export { catalog, categories };
