import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadDiscoveryRecipes, type DiscoveryInstallRecipe } from './discovery-package.js';
import { assertOfficialNamespacePackage } from './npm-discovery.js';

export type CapabilityInstallType = 'tool' | 'middleware';
export type CapabilityInstallScope = 'project' | 'global';

export interface InstalledCapabilityRecord {
  id: string;
  type: CapabilityInstallType;
  packageName: string;
  installDir: string;
  installedAt: string;
  source: 'project' | 'global';
}

interface InstalledCapabilityManifest {
  version: 1;
  entries: Array<Omit<InstalledCapabilityRecord, 'source'>>;
}

export interface InstallCapabilityRequest {
  type: CapabilityInstallType;
  name: string;
  scope?: CapabilityInstallScope;
  cwd?: string;
  homeDir?: string;
}

interface InstallCapabilityResult {
  record: InstalledCapabilityRecord;
  manifestPath: string;
}

export interface InstallRecipeExecutionRequest {
  recipeId: string;
  scope: CapabilityInstallScope;
  cwd?: string;
  homeDir?: string;
}

export interface InstallRecipeExecutionOptions {
  runInstall?: (installDir: string, packageName: string) => Promise<void>;
  now?: () => Date;
  writeManifest?: (manifestPath: string, data: InstalledCapabilityManifest) => Promise<void>;
  resolveChoice?: (
    choice: NonNullable<DiscoveryInstallRecipe['choices']>[number],
  ) => Promise<{ optionId: string; customPackageName?: string } | undefined>;
  shouldCancel?: () => boolean;
}

export interface InstallRecipeCompletedInstallStep {
  kind: 'install';
  packageName: string;
  capabilityType: CapabilityInstallType | 'package';
}

export interface InstallRecipeCompletedEnableStep {
  kind: 'enable';
  capabilityId: string;
  capabilityType: CapabilityInstallType;
}

export interface InstallRecipeCompletedToolConfigStep {
  kind: 'set-tool-config';
  id: string;
  config: Record<string, unknown>;
}

export interface InstallRecipeCompletedMiddlewareConfigStep {
  kind: 'set-middleware-config';
  id: string;
  config: Record<string, unknown>;
}

export type InstallRecipeCompletedStep =
  | InstallRecipeCompletedInstallStep
  | InstallRecipeCompletedEnableStep
  | InstallRecipeCompletedToolConfigStep
  | InstallRecipeCompletedMiddlewareConfigStep;

export interface InstallRecipeExecutionResult {
  recipeId: string;
  status: 'completed' | 'failed' | 'cancelled';
  completedSteps: InstallRecipeCompletedStep[];
  failedStep?: string;
  error?: string;
}

interface NormalizedCapabilityInstall {
  packageName: string;
  capabilityId: string;
  installDirName: string;
}

function assertValidSlug(slug: string, type: CapabilityInstallType): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`E6614: Invalid ${type} name '${slug}'. Use lowercase letters, numbers, and hyphens.`);
  }
}

function normalizeCapabilityName(type: CapabilityInstallType, name: string): NormalizedCapabilityInstall {
  const raw = name.trim().toLowerCase().replace(/^@sisu-ai\//, '');
  if (!raw) {
    throw new Error('E6610: Capability name cannot be empty.');
  }

  if (type === 'tool') {
    const slug = raw.replace(/^tool-/, '');
    assertValidSlug(slug, type);
    const normalized = `tool-${slug}`;
    const packageName = `@sisu-ai/${normalized}`;
    assertOfficialNamespacePackage(packageName);
    return {
      packageName,
      capabilityId: normalized,
      installDirName: slug,
    };
  }

  const slug = raw.replace(/^mw-/, '').replace(/^middleware-/, '');
  assertValidSlug(slug, type);
  const packageName = `@sisu-ai/mw-${slug}`;
  assertOfficialNamespacePackage(packageName);
  return {
    packageName,
    capabilityId: slug,
    installDirName: slug,
  };
}

function resolveScopeRoot(scope: CapabilityInstallScope, cwd: string, homeDir: string): string {
  return scope === 'project'
    ? path.join(cwd, '.sisu')
    : path.join(homeDir, '.sisu');
}

function resolveManifestPath(scopeRoot: string): string {
  return path.join(scopeRoot, 'capabilities', 'manifest.json');
}

function resolveInstallDir(
  scopeRoot: string,
  type: CapabilityInstallType,
  installDirName: string,
): string {
  return path.join(scopeRoot, 'capabilities', type === 'tool' ? 'tools' : 'middleware', installDirName);
}

async function readManifest(manifestPath: string): Promise<InstalledCapabilityManifest> {
  try {
    const content = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(content) as InstalledCapabilityManifest;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeManifestAtomically(manifestPath: string, data: InstalledCapabilityManifest): Promise<void> {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const tempPath = `${manifestPath}.tmp-${Date.now().toString(36)}`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, manifestPath);
}

async function ensureInstallProject(installDir: string): Promise<void> {
  await fs.mkdir(installDir, { recursive: true });
  const packageJsonPath = path.join(installDir, 'package.json');
  try {
    await fs.access(packageJsonPath);
  } catch {
    await fs.writeFile(packageJsonPath, `${JSON.stringify({
      name: 'sisu-capability-container',
      private: true,
    }, null, 2)}\n`, 'utf8');
  }
}

async function defaultInstallRunner(installDir: string, packageName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(
      'npm',
      ['install', '--silent', '--no-audit', '--no-fund', packageName],
      { cwd: installDir, maxBuffer: 1024 * 1024 * 16 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`E6611: npm install failed for '${packageName}': ${(stderr || stdout || error.message).trim()}`));
          return;
        }
        resolve();
      },
    );
  });
}

export async function installCapabilityPackage(
  request: InstallCapabilityRequest,
  options?: {
    runInstall?: (installDir: string, packageName: string) => Promise<void>;
    now?: () => Date;
    writeManifest?: (manifestPath: string, data: InstalledCapabilityManifest) => Promise<void>;
  },
): Promise<InstallCapabilityResult> {
  const cwd = request.cwd || process.cwd();
  const homeDir = request.homeDir || os.homedir();
  const scope = request.scope || 'project';
  const normalized = normalizeCapabilityName(request.type, request.name);

  const scopeRoot = resolveScopeRoot(scope, cwd, homeDir);
  const installDir = resolveInstallDir(scopeRoot, request.type, normalized.installDirName);
  const manifestPath = resolveManifestPath(scopeRoot);
  const nowIso = (options?.now || (() => new Date()))().toISOString();
  const runInstall = options?.runInstall || defaultInstallRunner;
  const writeManifest = options?.writeManifest || writeManifestAtomically;

  await ensureInstallProject(installDir);
  await runInstall(installDir, normalized.packageName);

  const manifest = await readManifest(manifestPath);
  const entry: Omit<InstalledCapabilityRecord, 'source'> = {
    id: normalized.capabilityId,
    type: request.type,
    packageName: normalized.packageName,
    installDir,
    installedAt: nowIso,
  };

  const nextEntries = manifest.entries.filter((current) => !(current.id === entry.id && current.type === entry.type));
  nextEntries.push(entry);

  try {
    await writeManifest(manifestPath, {
      version: 1,
      entries: nextEntries,
    });
  } catch (error) {
    await fs.rm(installDir, { recursive: true, force: true });
    throw new Error(`E6612: Failed to register installed capability: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    record: {
      ...entry,
      source: scope === 'project' ? 'project' : 'global',
    },
    manifestPath,
  };
}

export async function listInstalledCapabilities(options?: {
  cwd?: string;
  homeDir?: string;
}): Promise<InstalledCapabilityRecord[]> {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const roots: Array<{ source: InstalledCapabilityRecord['source']; manifestPath: string }> = [
    { source: 'global', manifestPath: resolveManifestPath(resolveScopeRoot('global', cwd, homeDir)) },
    { source: 'project', manifestPath: resolveManifestPath(resolveScopeRoot('project', cwd, homeDir)) },
  ];

  const records: InstalledCapabilityRecord[] = [];
  for (const root of roots) {
    const manifest = await readManifest(root.manifestPath);
    for (const entry of manifest.entries) {
      records.push({ ...entry, source: root.source });
    }
  }

  return records;
}

function resolveRecipe(recipeId: string): DiscoveryInstallRecipe {
  const installRecipes = loadDiscoveryRecipes().recipes;
  const recipe = installRecipes.find((entry) => entry.id === recipeId);
  if (!recipe) {
    throw new Error(`E6620: Unknown install recipe '${recipeId}'.`);
  }
  return recipe;
}

function normalizePackageInstallName(packageName: string): {
  type: CapabilityInstallType;
  name: string;
} | undefined {
  if (packageName.startsWith('@sisu-ai/tool-')) {
    return { type: 'tool', name: packageName };
  }
  if (packageName.startsWith('@sisu-ai/mw-')) {
    return { type: 'middleware', name: packageName };
  }
  return undefined;
}

async function installRawPackage(
  packageName: string,
  scope: CapabilityInstallScope,
  cwd: string,
  homeDir: string,
  options?: InstallRecipeExecutionOptions,
): Promise<void> {
  const scopeRoot = resolveScopeRoot(scope, cwd, homeDir);
  const installDir = path.join(scopeRoot, 'capabilities', 'packages');
  await ensureInstallProject(installDir);
  const runInstall = options?.runInstall || defaultInstallRunner;
  await runInstall(installDir, packageName);
}

async function resolveRecipeChoicePackage(
  recipe: DiscoveryInstallRecipe,
  options?: InstallRecipeExecutionOptions,
): Promise<string | undefined> {
  const choice = recipe.choices?.find((entry) => entry.id === 'vector-backend');
  if (!choice) {
    return undefined;
  }
  const resolver = options?.resolveChoice;
  if (!resolver) {
    const defaultOption = choice.options.find((option) => option.id === 'vectra') || choice.options[0];
    return defaultOption?.packageName;
  }
  const selected = await resolver(choice);
  if (!selected) {
    return undefined;
  }
  if (selected.optionId === 'custom') {
    const packageName = selected.customPackageName?.trim();
    if (!packageName) {
      throw new Error('E6621: Custom package name is required for custom backend.');
    }
    return packageName;
  }
  const option = choice.options.find((entry) => entry.id === selected.optionId);
  if (!option || !option.packageName) {
    throw new Error(`E6622: Unknown backend option '${selected.optionId}'.`);
  }
  return option.packageName;
}

function mapPostInstallAction(action: DiscoveryInstallRecipe['postInstall'][number]): InstallRecipeCompletedStep {
  if (action.kind === 'enableCapability') {
    if (action.type !== 'tool' && action.type !== 'middleware') {
      throw new Error(`E6624: Unsupported enable capability type '${String(action.type)}'.`);
    }
    return {
      kind: 'enable',
      capabilityId: action.id,
      capabilityType: action.type,
    };
  }
  if (action.scope === 'tool') {
    return { kind: 'set-tool-config', id: action.id, config: action.config };
  }
  return { kind: 'set-middleware-config', id: action.id, config: action.config };
}

export async function runInstallRecipe(
  request: InstallRecipeExecutionRequest,
  options?: InstallRecipeExecutionOptions,
): Promise<InstallRecipeExecutionResult> {
  const cwd = request.cwd || process.cwd();
  const homeDir = request.homeDir || os.homedir();
  const scope = request.scope || 'project';
  const recipe = resolveRecipe(request.recipeId);
  const completedSteps: InstallRecipeCompletedStep[] = [];

  if (options?.shouldCancel?.()) {
    return {
      recipeId: recipe.id,
      status: 'cancelled',
      completedSteps,
    };
  }

  let backendPackage: string | undefined;
  if (recipe.id === 'rag-advanced') {
    backendPackage = await resolveRecipeChoicePackage(recipe, options);
    if (!backendPackage) {
      return {
        recipeId: recipe.id,
        status: 'cancelled',
        completedSteps,
      };
    }
  }

  const installSteps = [...recipe.installs];
  if (backendPackage) {
    installSteps.push({ type: 'package', name: backendPackage });
  }

  for (const step of installSteps) {
    if (options?.shouldCancel?.()) {
      return {
        recipeId: recipe.id,
        status: 'cancelled',
        completedSteps,
      };
    }

    try {
      if (step.type === 'package') {
        await installRawPackage(step.name, scope, cwd, homeDir, options);
        completedSteps.push({
          kind: 'install',
          packageName: step.name,
          capabilityType: 'package',
        });
        continue;
      }

      const normalized = normalizePackageInstallName(step.name);
      if (!normalized || normalized.type !== step.type) {
        throw new Error(`E6623: Recipe step '${step.name}' does not match install type '${step.type}'.`);
      }
      const installed = await installCapabilityPackage(
        {
          type: normalized.type,
          name: normalized.name,
          scope,
          cwd,
          homeDir,
        },
        {
          runInstall: options?.runInstall,
          now: options?.now,
          writeManifest: options?.writeManifest,
        },
      );
      completedSteps.push({
        kind: 'install',
        packageName: installed.record.packageName,
        capabilityType: normalized.type,
      });
    } catch (error) {
      return {
        recipeId: recipe.id,
        status: 'failed',
        completedSteps,
        failedStep: `install:${step.type}:${step.name}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  for (const action of recipe.postInstall) {
    if (options?.shouldCancel?.()) {
      return {
        recipeId: recipe.id,
        status: 'cancelled',
        completedSteps,
      };
    }
    completedSteps.push(mapPostInstallAction(action));
  }

  if (backendPackage && recipe.id === 'rag-advanced') {
    const backend =
      backendPackage.includes('vector-chroma')
        ? 'chroma'
        : backendPackage.includes('vector-vectra')
          ? 'vectra'
          : 'custom';
    completedSteps.push({
      kind: 'set-tool-config',
      id: 'tool-rag',
      config: { backend, vectorPackage: backendPackage },
    });
    completedSteps.push({
      kind: 'set-middleware-config',
      id: 'rag',
      config: { backend, vectorPackage: backendPackage },
    });
  }

  return {
    recipeId: recipe.id,
    status: 'completed',
    completedSteps,
  };
}
