import os from 'node:os';
import {
  MIDDLEWARE_CATALOG,
  getLockedCoreMiddlewareIds,
  isLockedCoreMiddleware,
  type MiddlewareCatalogEntry,
} from './middleware/catalog.js';
import {
  discoverConfiguredSkills,
  getDefaultSkillDirectories,
  type DiscoveredSkill,
  type SkillDiscoveryDiagnostics,
} from './skills.js';

export type CapabilityType = 'tool' | 'skill' | 'middleware';
export type CapabilitySource = 'core' | 'catalog' | 'project' | 'global' | 'session' | 'custom';

export interface CapabilityEntry {
  id: string;
  type: CapabilityType;
  source: CapabilitySource;
  packageName?: string;
  description?: string;
  defaultEnabled: boolean;
  lockedCore?: boolean;
  configSchema?: 'none';
}

export interface MiddlewarePipelineEntry {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface CapabilitySectionConfig {
  enabled?: string[];
  disabled?: string[];
}

export interface MiddlewareConfig extends CapabilitySectionConfig {
  pipeline?: MiddlewarePipelineEntry[];
}

export interface SkillsConfig extends CapabilitySectionConfig {
  directories?: string[];
}

export interface CapabilityConfig {
  tools?: CapabilitySectionConfig;
  skills?: SkillsConfig;
  middleware?: MiddlewareConfig;
}

export interface CapabilityResolutionInput {
  defaults: CapabilityConfig;
  global?: CapabilityConfig;
  project?: CapabilityConfig;
  session?: CapabilityConfig;
}

export interface CapabilityResolutionResult {
  enabled: Set<string>;
  disabled: Set<string>;
  middlewarePipeline: MiddlewarePipelineEntry[];
}

export interface CapabilityRegistryBuildResult {
  registry: Map<string, CapabilityEntry>;
  skillDiagnostics: SkillDiscoveryDiagnostics[];
}

export const BUILTIN_TOOL_CAPABILITIES: CapabilityEntry[] = [
  {
    id: 'terminal',
    type: 'tool',
    source: 'core',
    packageName: '@sisu-ai/tool-terminal',
    description: 'Shell command execution with policy checks.',
    defaultEnabled: true,
    lockedCore: true,
    configSchema: 'none',
  },
];

function clonePipeline(entries: MiddlewarePipelineEntry[] | undefined): MiddlewarePipelineEntry[] {
  if (!entries) {
    return [];
  }
  return entries.map((entry) => ({
    id: entry.id,
    enabled: entry.enabled,
    config: entry.config ? { ...entry.config } : {},
  }));
}

function applySection(
  enabledSet: Set<string>,
  disabledSet: Set<string>,
  section?: CapabilitySectionConfig,
): void {
  if (!section) {
    return;
  }
  for (const id of section.enabled || []) {
    enabledSet.add(id);
    disabledSet.delete(id);
  }
  for (const id of section.disabled || []) {
    disabledSet.add(id);
    enabledSet.delete(id);
  }
}

function applyPipeline(
  pipeline: MiddlewarePipelineEntry[],
  middleware?: MiddlewareConfig,
): MiddlewarePipelineEntry[] {
  if (!middleware?.pipeline) {
    return pipeline;
  }
  return clonePipeline(middleware.pipeline);
}

export function resolveCapabilityState(input: CapabilityResolutionInput): CapabilityResolutionResult {
  const enabled = new Set<string>();
  const disabled = new Set<string>();

  applySection(enabled, disabled, input.defaults.tools);
  applySection(enabled, disabled, input.defaults.skills);
  applySection(enabled, disabled, input.defaults.middleware);

  applySection(enabled, disabled, input.global?.tools);
  applySection(enabled, disabled, input.global?.skills);
  applySection(enabled, disabled, input.global?.middleware);

  applySection(enabled, disabled, input.project?.tools);
  applySection(enabled, disabled, input.project?.skills);
  applySection(enabled, disabled, input.project?.middleware);

  applySection(enabled, disabled, input.session?.tools);
  applySection(enabled, disabled, input.session?.skills);
  applySection(enabled, disabled, input.session?.middleware);

  let pipeline = clonePipeline(input.defaults.middleware?.pipeline);
  pipeline = applyPipeline(pipeline, input.global?.middleware);
  pipeline = applyPipeline(pipeline, input.project?.middleware);
  pipeline = applyPipeline(pipeline, input.session?.middleware);

  for (const coreId of getLockedCoreMiddlewareIds()) {
    enabled.add(coreId);
    disabled.delete(coreId);
  }

  return { enabled, disabled, middlewarePipeline: pipeline };
}

function mapMiddlewareEntry(entry: MiddlewareCatalogEntry): CapabilityEntry {
  return {
    id: entry.id,
    type: 'middleware',
    source: entry.lockedCore ? 'core' : 'catalog',
    packageName: entry.packageName,
    description: entry.description,
    defaultEnabled: Boolean(entry.defaultEnabled),
    lockedCore: Boolean(entry.lockedCore),
    configSchema: 'none',
  };
}

function mapSkillEntry(skill: DiscoveredSkill): CapabilityEntry {
  return {
    id: skill.id,
    type: 'skill',
    source: skill.source,
    description: skill.description,
    defaultEnabled: true,
    lockedCore: false,
    configSchema: 'none',
  };
}

export async function buildCapabilityRegistry(
  options?: { cwd?: string; homeDir?: string; skillDirectories?: string[] },
): Promise<CapabilityRegistryBuildResult> {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const { globalDir, projectDir } = getDefaultSkillDirectories(cwd, homeDir);
  const directories = options?.skillDirectories || [projectDir, globalDir];

  const discovered = await discoverConfiguredSkills(directories, cwd);
  const registry = new Map<string, CapabilityEntry>();

  for (const tool of BUILTIN_TOOL_CAPABILITIES) {
    registry.set(tool.id, tool);
  }

  for (const middleware of MIDDLEWARE_CATALOG.map(mapMiddlewareEntry)) {
    registry.set(middleware.id, middleware);
  }

  for (const skill of discovered.skills.map(mapSkillEntry)) {
    registry.set(skill.id, skill);
  }

  return {
    registry,
    skillDiagnostics: discovered.diagnostics,
  };
}

export function enforceLockedCoreMiddleware(
  pipeline: MiddlewarePipelineEntry[],
  enabled: Set<string>,
): void {
  for (const coreId of getLockedCoreMiddlewareIds()) {
    if (!enabled.has(coreId)) {
      throw new Error(`E6506: Locked core middleware '${coreId}' cannot be disabled.`);
    }
  }

  const pipelineIds = new Set(pipeline.filter((entry) => entry.enabled !== false).map((entry) => entry.id));
  for (const coreId of getLockedCoreMiddlewareIds()) {
    if (pipeline.length > 0 && !pipelineIds.has(coreId)) {
      throw new Error(`E6507: Locked core middleware '${coreId}' cannot be removed from pipeline.`);
    }
  }

  if (pipeline.length > 0) {
    const positions = getLockedCoreMiddlewareIds()
      .map((id) => ({ id, index: pipeline.findIndex((entry) => entry.id === id && entry.enabled !== false) }))
      .filter((entry) => entry.index >= 0);

    for (let index = 1; index < positions.length; index += 1) {
      if (positions[index].index < positions[index - 1].index) {
        throw new Error('E6508: Locked core middleware ordering constraints were violated.');
      }
    }
  }
}

export function describeCapabilitySource(source: CapabilitySource): string {
  switch (source) {
    case 'core':
      return 'core';
    case 'catalog':
      return 'catalog';
    case 'project':
      return 'project';
    case 'global':
      return 'global';
    case 'session':
      return 'session';
    default:
      return 'custom';
  }
}

export function isMiddlewareCapability(id: string): boolean {
  return MIDDLEWARE_CATALOG.some((entry) => entry.id === id);
}

export function isLockedMiddlewareCapability(id: string): boolean {
  return isLockedCoreMiddleware(id);
}
