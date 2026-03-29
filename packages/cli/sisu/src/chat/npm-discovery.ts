import { execFile } from 'node:child_process';

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
    execFile('npm', ['search', '--json', query], { maxBuffer: 1024 * 1024 * 4 }, (error, stdout) => {
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
    });
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

export async function listOfficialPackages(
  category: OfficialCapabilityCategory,
): Promise<OfficialPackageInfo[]> {
  const prefix = getOfficialPrefix(category);
  const candidates = await npmSearch(prefix);
  return filterOfficialPackages(category, candidates);
}
