import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertOfficialNamespacePackage } from './npm-discovery.js';

export type SkillInstallScope = 'project' | 'global';

export interface InstallSkillRequest {
  packageOrPath: string;
  scope?: SkillInstallScope;
  dir?: string;
  cwd?: string;
  homeDir?: string;
  officialOnly?: boolean;
}

export interface InstalledSkillResult {
  skillId: string;
  targetDir: string;
  sourceType: 'npm' | 'local';
}

function execFileAsync(
  file: string,
  args: string[],
  options?: { cwd?: string; maxBuffer?: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: options?.cwd, maxBuffer: options?.maxBuffer ?? 1024 * 1024 * 16 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${file} ${args.join(' ')} failed: ${(stderr || stdout || error.message).trim()}`));
        return;
      }
      resolve(String(stdout || '').trim());
    });
  });
}

function normalizeSkillId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    throw new Error('E6704: Could not determine skill id.');
  }
  return normalized;
}

function parseSkillNameFromMarkdown(content: string): string | undefined {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) {
    return undefined;
  }
  const frontmatter = frontmatterMatch[1];
  const nameLine = frontmatter
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('name:'));
  if (!nameLine) {
    return undefined;
  }
  const raw = nameLine.slice('name:'.length).trim().replace(/^['"]|['"]$/g, '');
  return raw || undefined;
}

function fallbackSkillIdFromPackageName(packageName: string): string {
  const short = packageName.split('/').pop() || packageName;
  return normalizeSkillId(short.replace(/^skill-/, ''));
}

export function resolveSkillTargetRoot(options?: {
  scope?: SkillInstallScope;
  dir?: string;
  cwd?: string;
  homeDir?: string;
}): string {
  if (options?.dir) {
    return path.resolve(options.dir);
  }
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const scope = options?.scope || 'project';
  return scope === 'global'
    ? path.join(homeDir, '.sisu', 'skills')
    : path.join(cwd, '.sisu', 'skills');
}

async function readSkillIdFromDirectory(sourceDir: string, packageOrPath: string): Promise<string> {
  const skillPath = path.join(sourceDir, 'SKILL.md');
  let content: string;
  try {
    content = await fs.readFile(skillPath, 'utf8');
  } catch {
    throw new Error(`E6702: SKILL.md not found in ${sourceDir}.`);
  }
  const declared = parseSkillNameFromMarkdown(content);
  if (declared) {
    return normalizeSkillId(declared);
  }
  return fallbackSkillIdFromPackageName(packageOrPath);
}

async function installFromDirectory(
  sourceDir: string,
  packageOrPath: string,
  targetRoot: string,
  sourceType: InstalledSkillResult['sourceType'],
): Promise<InstalledSkillResult> {
  const skillId = await readSkillIdFromDirectory(sourceDir, packageOrPath);
  const targetDir = path.join(targetRoot, skillId);
  await fs.mkdir(targetRoot, { recursive: true });
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
  return { skillId, targetDir, sourceType };
}

export async function installSkill(request: InstallSkillRequest): Promise<InstalledSkillResult> {
  const cwd = request.cwd || process.cwd();
  const sourcePath = path.resolve(cwd, request.packageOrPath);
  const targetRoot = resolveSkillTargetRoot({
    scope: request.scope,
    dir: request.dir,
    cwd,
    homeDir: request.homeDir,
  });

  const localStat = await fs.stat(sourcePath).catch(() => undefined);
  if (localStat?.isDirectory()) {
    return await installFromDirectory(sourcePath, request.packageOrPath, targetRoot, 'local');
  }

  if (request.officialOnly) {
    assertOfficialNamespacePackage(request.packageOrPath);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-skill-install-'));
  try {
    const packOutput = await execFileAsync('npm', ['pack', request.packageOrPath, '--silent'], { cwd: tempDir });
    const lines = packOutput.split('\n').map((line) => line.trim()).filter(Boolean);
    const tarballName = lines.length > 0 ? lines[lines.length - 1] : undefined;
    if (!tarballName) {
      throw new Error(`E6701: npm pack returned no tarball name for '${request.packageOrPath}'.`);
    }

    await execFileAsync('tar', ['-xzf', tarballName], { cwd: tempDir });
    const packageDir = path.join(tempDir, 'package');
    return await installFromDirectory(packageDir, request.packageOrPath, targetRoot, 'npm');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
