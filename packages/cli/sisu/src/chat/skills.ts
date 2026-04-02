import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSkills } from '@sisu-ai/mw-skills';

export interface DiscoveredSkill {
  id: string;
  description: string;
  source: 'project' | 'global' | 'custom';
  directory: string;
}

export interface SkillDiscoveryDiagnostics {
  path: string;
  error: string;
}

export interface LocalSkillDiscoveryResult {
  skills: DiscoveredSkill[];
  diagnostics: SkillDiscoveryDiagnostics[];
}

export function getDefaultSkillDirectories(cwd = process.cwd(), homeDir = os.homedir()): {
  globalDir: string;
  projectDir: string;
  bundledInstallerDir: string;
} {
  const bundledInstallerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/skills/installer');
  return {
    globalDir: path.join(homeDir, '.sisu', 'skills'),
    projectDir: path.join(cwd, '.sisu', 'skills'),
    bundledInstallerDir,
  };
}

function toSource(directory: string, projectDir: string, globalDir: string): DiscoveredSkill['source'] {
  if (directory.startsWith(projectDir)) {
    return 'project';
  }
  if (directory.startsWith(globalDir)) {
    return 'global';
  }
  return 'custom';
}

export async function discoverConfiguredSkills(
  directories: string[],
  cwd = process.cwd(),
): Promise<LocalSkillDiscoveryResult> {
  const { bundledInstallerDir } = getDefaultSkillDirectories(cwd);
  const roots = [...directories];
  if (fs.existsSync(bundledInstallerDir) && !roots.includes(bundledInstallerDir)) {
    roots.push(bundledInstallerDir);
  }

  if (roots.length === 0) {
    return { skills: [], diagnostics: [] };
  }

  const { globalDir, projectDir } = getDefaultSkillDirectories(cwd);
  const result = await discoverSkills({ directories: roots, cwd });
  const merged = new Map<string, DiscoveredSkill>();

  for (const skill of result.skills) {
    const source = toSource(skill.directory, projectDir, globalDir);
    const normalized: DiscoveredSkill = {
      id: skill.metadata.name,
      description: skill.metadata.description || '',
      source,
      directory: skill.directory,
    };

    const existing = merged.get(normalized.id);
    if (!existing) {
      merged.set(normalized.id, normalized);
      continue;
    }

    if (existing.source === 'global' && normalized.source === 'project') {
      merged.set(normalized.id, normalized);
    }
  }

  return {
    skills: [...merged.values()],
    diagnostics: result.errors.map((entry) => ({
      path: entry.path,
      error: entry.error,
    })),
  };
}
