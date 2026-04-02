import { execFile } from 'node:child_process';
import {
  loadDiscoveryCatalog,
  type DiscoveryCatalogEntry,
} from './discovery-package.js';

export type OfficialCapabilityCategory = 'middleware' | 'tools' | 'skills';

export interface OfficialPackageInfo {
  name: string;
  version: string;
  description: string;
}

const PREFIX_BY_CATEGORY: Record<OfficialCapabilityCategory, string> = {
  middleware: '@sisu-ai/mw-',
  tools: '@sisu-ai/tool-',
  skills: '@sisu-ai/skill-',
};

const OFFICIAL_NAMESPACE = '@sisu-ai/';
const NPM_SEARCH_LIMIT = 250;
let lastDiscoveryDiagnostics: string[] = [];
let discoveryCatalogLoader: undefined | (() => Promise<DiscoveryCatalogEntry[]>);

interface NpmSearchEntry {
  name?: string;
  version?: string;
  description?: string;
}

export function getOfficialPrefix(category: OfficialCapabilityCategory): string {
  return PREFIX_BY_CATEGORY[category];
}

function npmSearch(query: string): Promise<NpmSearchEntry[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'npm',
      ['search', '--json', '--searchlimit', String(NPM_SEARCH_LIMIT), query],
      { maxBuffer: 1024 * 1024 * 8 },
      (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        const parsed = JSON.parse(stdout || '[]');
        if (!Array.isArray(parsed)) {
          resolve([]);
          return;
        }
        resolve(parsed as NpmSearchEntry[]);
      } catch (parseError) {
        reject(parseError);
      }
      },
    );
  });
}

export function isOfficialNamespacePackage(name: string): boolean {
  return name.startsWith(OFFICIAL_NAMESPACE);
}

export function assertOfficialNamespacePackage(name: string): void {
  if (!isOfficialNamespacePackage(name)) {
    throw new Error(`E6601: Official install requires @sisu-ai namespace package. Received: ${name}`);
  }
}

export function filterOfficialPackages(
  category: OfficialCapabilityCategory,
  candidates: NpmSearchEntry[],
): OfficialPackageInfo[] {
  const prefix = getOfficialPrefix(category);
  const filtered = candidates
    .filter((entry) => typeof entry.name === 'string' && entry.name.startsWith(prefix))
    .map((entry) => ({
      name: entry.name!,
      version: entry.version || 'unknown',
      description: entry.description || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const deduped = new Map<string, OfficialPackageInfo>();
  for (const entry of filtered) {
    if (!deduped.has(entry.name)) {
      deduped.set(entry.name, entry);
    }
  }
  return [...deduped.values()];
}

function validateDiscoveryEntry(entry: DiscoveryCatalogEntry): string[] {
  const issues: string[] = [];
  if (!entry || typeof entry !== 'object') {
    return ['Entry is not an object.'];
  }
  if (!entry.packageName || typeof entry.packageName !== 'string') {
    issues.push('Missing required packageName.');
  } else if (!isOfficialNamespacePackage(entry.packageName)) {
    issues.push(`Package must use @sisu-ai namespace (received ${entry.packageName}).`);
  }
  if (!entry.category || typeof entry.category !== 'string') {
    issues.push('Missing required category.');
  }
  if (!entry.title || typeof entry.title !== 'string') {
    issues.push('Missing required title.');
  }
  if (!entry.summary || typeof entry.summary !== 'string') {
    issues.push('Missing required summary.');
  }
  return issues;
}

async function loadDiscoveryCatalogEntries(): Promise<DiscoveryCatalogEntry[]> {
  try {
    if (discoveryCatalogLoader) {
      return await discoveryCatalogLoader();
    }
    const payload = loadDiscoveryCatalog();
    if (!Array.isArray(payload.entries)) {
      throw new Error('catalog entries are not an array.');
    }
    return payload.entries as DiscoveryCatalogEntry[];
  } catch (error) {
    throw new Error(
      `E6602: Failed to load @sisu-ai/discovery catalog: ${error instanceof Error ? error.message : String(error)}. Custom package install is still available.`,
    );
  }
}

function toCategoryPrefix(category: OfficialCapabilityCategory): string {
  return getOfficialPrefix(category);
}

function mapDiscoveryToOfficialPackages(
  category: OfficialCapabilityCategory,
  entries: DiscoveryCatalogEntry[],
): OfficialPackageInfo[] {
  const prefix = toCategoryPrefix(category);
  const diagnostics: string[] = [];
  const result = new Map<string, OfficialPackageInfo>();

  for (const entry of entries) {
    const issues = validateDiscoveryEntry(entry);
    if (issues.length > 0) {
      diagnostics.push(`${entry?.id || '<unknown>'}: ${issues.join(' ')}`);
      continue;
    }
    if (entry.category !== category) {
      continue;
    }
    if (!entry.packageName || !entry.packageName.startsWith(prefix)) {
      continue;
    }
    if (!result.has(entry.packageName)) {
      result.set(entry.packageName, {
        name: entry.packageName,
        version: entry.version || 'unknown',
        description: entry.summary || '',
      });
    }
  }

  lastDiscoveryDiagnostics = diagnostics;
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getDiscoveryDiagnostics(): string[] {
  return [...lastDiscoveryDiagnostics];
}

export function setDiscoveryCatalogLoaderForTests(
  loader: (() => Promise<DiscoveryCatalogEntry[]>) | undefined,
): void {
  discoveryCatalogLoader = loader;
}

export async function listOfficialPackages(
  category: OfficialCapabilityCategory,
  options?: { allowNpmFallback?: boolean },
): Promise<OfficialPackageInfo[]> {
  try {
    const entries = await loadDiscoveryCatalogEntries();
    return mapDiscoveryToOfficialPackages(category, entries);
  } catch (error) {
    if (!options?.allowNpmFallback) {
      throw error;
    }
    const prefix = getOfficialPrefix(category);
    const candidates = await npmSearch(prefix);
    lastDiscoveryDiagnostics = [
      `Discovery unavailable, used npm search fallback for ${category}.`,
    ];
    return filterOfficialPackages(category, candidates);
  }
}
