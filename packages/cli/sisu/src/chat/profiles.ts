import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type ToolPolicy, mergeToolPolicy } from './tool-policy.js';
import {
  CORE_MIDDLEWARE_ORDER,
  isLockedCoreMiddleware,
} from './middleware/catalog.js';
import { validateToolConfig } from './tool-config.js';

export type CapabilityType = 'tool' | 'skill' | 'middleware';

export type ChatProviderId = 'mock' | 'openai' | 'anthropic' | 'ollama';

export interface ChatProfile {
  name: string;
  provider: ChatProviderId;
  model: string;
  systemPrompt?: string;
  theme: 'auto' | 'color' | 'plain';
  toolPolicy: ToolPolicy;
  storageDir: string;
  capabilities?: ChatCapabilityConfig;
}

export interface CapabilityScopeConfig {
  enabled: string[];
  disabled: string[];
}

export interface ToolsScopeConfig extends CapabilityScopeConfig {
  config: Record<string, Record<string, unknown>>;
}

export interface MiddlewarePipelineEntry {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface MiddlewareScopeConfig extends CapabilityScopeConfig {
  pipeline: MiddlewarePipelineEntry[];
}

export interface SkillsScopeConfig extends CapabilityScopeConfig {
  directories: string[];
}

export interface ChatCapabilityConfig {
  tools: ToolsScopeConfig;
  skills: SkillsScopeConfig;
  middleware: MiddlewareScopeConfig;
}

export interface CapabilityOverrideInput {
  tools?: Partial<ToolsScopeConfig>;
  skills?: Partial<SkillsScopeConfig>;
  middleware?: Partial<MiddlewareScopeConfig>;
}

export interface ProfileValidationIssue {
  field: string;
  message: string;
}

export class ProfileValidationError extends Error {
  issues: ProfileValidationIssue[];

  constructor(issues: ProfileValidationIssue[]) {
    super(`Invalid profile configuration:\n${issues.map((issue) => `- ${issue.field}: ${issue.message}`).join('\n')}`);
    this.name = 'ProfileValidationError';
    this.issues = issues;
  }
}

export interface ProfileLoadOptions {
  cwd?: string;
  homeDir?: string;
  globalPath?: string;
  projectPath?: string;
  installedOllamaModels?: string[];
  knownCapabilityIds?: string[];
}

export const PROFILE_FILE_NAME = 'chat-profile.json';
export const RECOMMENDED_OLLAMA_MODELS = ['qwen3.5:9b', 'llama3.1', 'llama4', 'qwen3.5:0.8b'] as const;
const DEFAULT_MODEL_BY_PROVIDER: Record<ChatProviderId, string> = {
  mock: 'sisu-mock-chat-v1',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  ollama: RECOMMENDED_OLLAMA_MODELS[0],
};

export function getGlobalProfilePath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.sisu', PROFILE_FILE_NAME);
}

export function getProjectProfilePath(cwd = process.cwd()): string {
  return path.join(cwd, '.sisu', PROFILE_FILE_NAME);
}

export function defaultChatProfile(options?: { cwd?: string; homeDir?: string }): ChatProfile {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();

  return {
    name: 'default',
    provider: 'mock',
    model: DEFAULT_MODEL_BY_PROVIDER.mock,
    systemPrompt: '',
    theme: 'auto',
    toolPolicy: mergeToolPolicy(),
    storageDir: path.join(homeDir, '.sisu', 'chat-sessions', path.basename(cwd)),
    capabilities: {
      tools: {
        enabled: ['terminal'],
        disabled: [],
        config: {},
      },
      skills: {
        enabled: [],
        disabled: [],
        directories: [
          path.join(cwd, '.sisu', 'skills'),
          path.join(homeDir, '.sisu', 'skills'),
        ],
      },
      middleware: {
        enabled: [...CORE_MIDDLEWARE_ORDER, 'conversation-buffer', 'skills'],
        disabled: [],
        pipeline: [
          { id: 'error-boundary', enabled: true, config: {} },
          { id: 'invariants', enabled: true, config: {} },
          { id: 'register-tools', enabled: true, config: {} },
          { id: 'tool-calling', enabled: true, config: {} },
          { id: 'conversation-buffer', enabled: true, config: {} },
          { id: 'skills', enabled: true, config: {} },
        ],
      },
    },
  };
}

function cloneToolConfigMap(
  config: Record<string, Record<string, unknown>> | undefined,
): Record<string, Record<string, unknown>> {
  if (!config) {
    return {};
  }
  const clone: Record<string, Record<string, unknown>> = {};
  for (const [toolId, toolConfig] of Object.entries(config)) {
    clone[toolId] = { ...toolConfig };
  }
  return clone;
}

export function ensureCapabilityDefaults(
  profile: ChatProfile,
  options?: { cwd?: string; homeDir?: string },
): ChatCapabilityConfig {
  const defaults = defaultChatProfile(options).capabilities!;
  const capabilities = profile.capabilities;
  if (!capabilities) {
    return defaults;
  }
  return {
    tools: {
      enabled: capabilities.tools?.enabled || defaults.tools.enabled,
      disabled: capabilities.tools?.disabled || [],
      config: cloneToolConfigMap(capabilities.tools?.config || defaults.tools.config),
    },
    skills: {
      enabled: capabilities.skills?.enabled || [],
      disabled: capabilities.skills?.disabled || [],
      directories: capabilities.skills?.directories || defaults.skills.directories,
    },
    middleware: {
      enabled: capabilities.middleware?.enabled || defaults.middleware.enabled,
      disabled: capabilities.middleware?.disabled || [],
      pipeline: capabilities.middleware?.pipeline || defaults.middleware.pipeline,
    },
  };
}

export function parseOllamaListOutput(output: string): string[] {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const models: string[] = [];
  for (const line of lines) {
    if (line.toLowerCase().startsWith('name ')) {
      continue;
    }
    const match = line.match(/^(\S+)\s+/);
    if (!match || !match[1]) {
      continue;
    }
    models.push(match[1]);
  }
  return models;
}

export function selectPreferredOllamaModel(
  installedModels: string[],
  recommended: readonly string[] = RECOMMENDED_OLLAMA_MODELS,
): string | undefined {
  const normalized = new Set(installedModels);
  for (const candidate of recommended) {
    if (normalized.has(candidate)) {
      return candidate;
    }
  }
  return installedModels[0];
}

export async function getInstalledOllamaModels(options?: { cwd?: string; timeoutMs?: number }): Promise<string[]> {
  const cwd = options?.cwd || process.cwd();
  const timeoutMs = options?.timeoutMs ?? 1500;

  return await new Promise((resolve, reject) => {
    const child = spawn('ollama', ['list'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let settled = false;
    const finish = (models: string[]) => {
      if (!settled) {
        settled = true;
        resolve(models);
      }
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish([]);
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
        finish([]);
        return;
      }
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish([]);
        return;
      }
      finish(parseOllamaListOutput(stdoutBuffer));
    });
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseJsonFile(content: string, filePath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON profile at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`Profile at ${filePath} must be a JSON object.`);
  }
  return record;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function expandHomeDirectory(input: string, homeDir: string): string {
  if (input === '~') {
    return homeDir;
  }
  if (input.startsWith('~/')) {
    return path.join(homeDir, input.slice(2));
  }
  return input;
}

function normalizeDirectoryList(value: unknown, cwd: string, homeDir: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const directories: string[] = [];
  for (const item of value) {
    const raw = String(item).trim();
    if (!raw) {
      continue;
    }
    const expanded = expandHomeDirectory(raw, homeDir);
    const normalized = path.isAbsolute(expanded)
      ? path.normalize(expanded)
      : path.resolve(cwd, expanded);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    directories.push(normalized);
  }
  return directories;
}

function parseCapabilityScope(input: Record<string, unknown> | undefined): CapabilityScopeConfig {
  if (!input) {
    return { enabled: [], disabled: [] };
  }
  return {
    enabled: normalizeIdList(input.enabled),
    disabled: normalizeIdList(input.disabled),
  };
}

function parseToolConfigMap(
  value: unknown,
): Record<string, Record<string, unknown>> {
  const input = asRecord(value);
  if (!input) {
    return {};
  }
  const parsed: Record<string, Record<string, unknown>> = {};
  for (const [toolId, rawConfig] of Object.entries(input)) {
    const id = toolId.trim();
    if (!id) {
      continue;
    }
    const config = asRecord(rawConfig);
    if (!config) {
      continue;
    }
    parsed[id] = { ...config };
  }
  return parsed;
}

function parseToolsScope(input: Record<string, unknown> | undefined): ToolsScopeConfig {
  const base = parseCapabilityScope(input);
  return {
    ...base,
    config: parseToolConfigMap(input?.config),
  };
}

function validateToolConfigs(
  tools: ToolsScopeConfig,
  knownCapabilityIds: string[] | undefined,
  issues: ProfileValidationIssue[],
): void {
  const knownTools = knownCapabilityIds ? new Set(knownCapabilityIds) : undefined;
  for (const [toolId, toolConfig] of Object.entries(tools.config)) {
    if (knownTools && !knownTools.has(toolId)) {
      issues.push({
        field: `capabilities.tools.config.${toolId}`,
        message: `Unknown capability id '${toolId}'.`,
      });
      continue;
    }
    const toolIssues = validateToolConfig(toolId, toolConfig || {});
    for (const issue of toolIssues) {
      issues.push({
        field: `capabilities.tools.config.${toolId}`,
        message: issue,
      });
    }
  }
}

function parseMiddlewarePipeline(value: unknown): MiddlewarePipelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item) => ({
      id: String(item.id || '').trim(),
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
      config: asRecord(item.config) || {},
    }))
    .filter((item) => item.id.length > 0);
}

function parseSkillsScope(
  input: Record<string, unknown> | undefined,
  cwd: string,
  homeDir: string,
): SkillsScopeConfig {
  if (!input) {
    return { enabled: [], disabled: [], directories: [] };
  }
  return {
    enabled: normalizeIdList(input.enabled),
    disabled: normalizeIdList(input.disabled),
    directories: normalizeDirectoryList(input.directories, cwd, homeDir),
  };
}

function parseMiddlewareScope(input: Record<string, unknown> | undefined): MiddlewareScopeConfig {
  if (!input) {
    return { enabled: [], disabled: [], pipeline: [] };
  }
  return {
    enabled: normalizeIdList(input.enabled),
    disabled: normalizeIdList(input.disabled),
    pipeline: parseMiddlewarePipeline(input.pipeline),
  };
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function checkEnableDisableConflicts(scope: CapabilityScopeConfig, field: string, issues: ProfileValidationIssue[]): void {
  const enabledSet = new Set(scope.enabled);
  for (const id of scope.disabled) {
    if (enabledSet.has(id)) {
      issues.push({
        field,
        message: `Capability '${id}' cannot appear in both enabled and disabled.`,
      });
    }
  }
}

function validateKnownCapabilityIds(
  ids: string[],
  knownCapabilityIds: string[] | undefined,
  field: string,
  issues: ProfileValidationIssue[],
): void {
  if (!knownCapabilityIds || knownCapabilityIds.length === 0) {
    return;
  }
  const known = new Set(knownCapabilityIds);
  for (const id of ids) {
    if (!known.has(id)) {
      issues.push({ field, message: `Unknown capability id '${id}'.` });
    }
  }
}

function validateLockedCore(
  middleware: MiddlewareScopeConfig,
  issues: ProfileValidationIssue[],
): void {
  for (const id of middleware.disabled) {
    if (isLockedCoreMiddleware(id)) {
      issues.push({
        field: 'capabilities.middleware.disabled',
        message: `Locked core middleware '${id}' cannot be disabled.`,
      });
    }
  }

  const duplicatePipeline = findDuplicates(middleware.pipeline.map((entry) => entry.id));
  for (const id of duplicatePipeline) {
    issues.push({
      field: 'capabilities.middleware.pipeline',
      message: `Duplicate middleware pipeline entry '${id}'.`,
    });
  }

  for (const entry of middleware.pipeline) {
    if (isLockedCoreMiddleware(entry.id) && entry.enabled === false) {
      issues.push({
        field: 'capabilities.middleware.pipeline',
        message: `Locked core middleware '${entry.id}' cannot be disabled in pipeline.`,
      });
    }
  }
}

async function readOptionalProfile(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parseJsonFile(content, filePath);
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function mergeRecords(base: Record<string, unknown>, overlay?: Record<string, unknown>): Record<string, unknown> {
  if (!overlay) {
    return { ...base };
  }

  const merged: Record<string, unknown> = { ...base, ...overlay };
  const baseToolPolicy = asRecord(base.toolPolicy) || {};
  const overlayToolPolicy = asRecord(overlay.toolPolicy) || {};
  merged.toolPolicy = { ...baseToolPolicy, ...overlayToolPolicy };

  const baseCapabilities = asRecord(base.capabilities) || {};
  const overlayCapabilities = asRecord(overlay.capabilities) || {};
  const mergedCapabilities: Record<string, unknown> = { ...baseCapabilities, ...overlayCapabilities };

  const mergeScope = (key: 'tools' | 'skills' | 'middleware') => {
    const baseScope = asRecord(baseCapabilities[key]) || {};
    const overlayScope = asRecord(overlayCapabilities[key]) || {};
    const mergedScope: Record<string, unknown> = { ...baseScope, ...overlayScope };
    if (key === 'tools') {
      const baseConfig = parseToolConfigMap(baseScope.config);
      const overlayConfig = parseToolConfigMap(overlayScope.config);
      const mergedConfig: Record<string, Record<string, unknown>> = { ...baseConfig };
      for (const [toolId, toolConfig] of Object.entries(overlayConfig)) {
        mergedConfig[toolId] = {
          ...(baseConfig[toolId] || {}),
          ...toolConfig,
        };
      }
      mergedScope.config = mergedConfig;
    }
    mergedCapabilities[key] = mergedScope;
  };

  mergeScope('tools');
  mergeScope('skills');
  mergeScope('middleware');
  merged.capabilities = mergedCapabilities;
  return merged;
}

function asProvider(value: unknown): ChatProviderId | undefined {
  if (value === 'mock' || value === 'openai' || value === 'anthropic' || value === 'ollama') {
    return value;
  }
  return undefined;
}

function defaultModelForProvider(provider: ChatProviderId, fallback: string): string {
  return DEFAULT_MODEL_BY_PROVIDER[provider] || fallback;
}

export function suggestedModelForProvider(provider: ChatProviderId, installedOllamaModels?: string[]): string {
  if (provider === 'ollama') {
    return selectPreferredOllamaModel(installedOllamaModels || []) || defaultModelForProvider('ollama', DEFAULT_MODEL_BY_PROVIDER.ollama);
  }
  return defaultModelForProvider(provider, DEFAULT_MODEL_BY_PROVIDER.mock);
}

export function validateAndNormalizeProfile(
  input: Record<string, unknown>,
  defaults: ChatProfile,
  options?: { knownCapabilityIds?: string[]; cwd?: string; homeDir?: string },
): ChatProfile {
  const issues: ProfileValidationIssue[] = [];
  const defaultCapabilities = ensureCapabilityDefaults(defaults);
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();

  const provider = input.provider === undefined ? defaults.provider : asProvider(input.provider);
  if (!provider) {
    issues.push({ field: 'provider', message: 'Must be one of: mock, openai, anthropic, ollama.' });
  }

  const model = input.model === undefined
    ? defaultModelForProvider(provider || defaults.provider, defaults.model)
    : String(input.model);
  if (!model || model.trim().length === 0) {
    issues.push({ field: 'model', message: 'Model must be a non-empty string.' });
  }

  const theme = input.theme === undefined ? defaults.theme : input.theme;
  if (theme !== 'auto' && theme !== 'color' && theme !== 'plain') {
    issues.push({ field: 'theme', message: 'Theme must be one of: auto, color, plain.' });
  }

  const storageDir = input.storageDir === undefined ? defaults.storageDir : String(input.storageDir);
  if (!storageDir || storageDir.trim().length === 0) {
    issues.push({ field: 'storageDir', message: 'storageDir must be a non-empty string.' });
  }

  const name = input.name === undefined ? defaults.name : String(input.name);
  if (!name || name.trim().length === 0) {
    issues.push({ field: 'name', message: 'Name must be a non-empty string.' });
  }

  const systemPrompt = input.systemPrompt === undefined ? (defaults.systemPrompt || '') : String(input.systemPrompt);

  const toolPolicyInput = asRecord(input.toolPolicy) || {};
  const policy = mergeToolPolicy({
    mode: typeof toolPolicyInput.mode === 'string' ? (toolPolicyInput.mode as ToolPolicy['mode']) : defaults.toolPolicy.mode,
    allowCommandPrefixes: Array.isArray(toolPolicyInput.allowCommandPrefixes)
      ? toolPolicyInput.allowCommandPrefixes.map(String)
      : defaults.toolPolicy.allowCommandPrefixes,
    denyCommandPatterns: Array.isArray(toolPolicyInput.denyCommandPatterns)
      ? toolPolicyInput.denyCommandPatterns.map(String)
      : defaults.toolPolicy.denyCommandPatterns,
    highImpactPatterns: Array.isArray(toolPolicyInput.highImpactPatterns)
      ? toolPolicyInput.highImpactPatterns.map(String)
      : defaults.toolPolicy.highImpactPatterns,
    requireConfirmationForHighImpact:
      typeof toolPolicyInput.requireConfirmationForHighImpact === 'boolean'
        ? toolPolicyInput.requireConfirmationForHighImpact
        : defaults.toolPolicy.requireConfirmationForHighImpact,
    maxCommandLength:
      typeof toolPolicyInput.maxCommandLength === 'number'
        ? toolPolicyInput.maxCommandLength
        : defaults.toolPolicy.maxCommandLength,
  });

  if (policy.mode !== 'strict' && policy.mode !== 'balanced' && policy.mode !== 'permissive') {
    issues.push({ field: 'toolPolicy.mode', message: 'Mode must be one of: strict, balanced, permissive.' });
  }

  const capabilitiesInput = asRecord(input.capabilities);
  const toolsScope = parseToolsScope(asRecord(capabilitiesInput?.tools));
  const skillsScope = parseSkillsScope(asRecord(capabilitiesInput?.skills), cwd, homeDir);
  const middlewareScope = parseMiddlewareScope(asRecord(capabilitiesInput?.middleware));

  checkEnableDisableConflicts(toolsScope, 'capabilities.tools', issues);
  checkEnableDisableConflicts(skillsScope, 'capabilities.skills', issues);
  checkEnableDisableConflicts(middlewareScope, 'capabilities.middleware', issues);

  validateKnownCapabilityIds(
    [...toolsScope.enabled, ...toolsScope.disabled],
    options?.knownCapabilityIds,
    'capabilities.tools',
    issues,
  );
  validateKnownCapabilityIds(
    [...skillsScope.enabled, ...skillsScope.disabled],
    options?.knownCapabilityIds,
    'capabilities.skills',
    issues,
  );
  validateKnownCapabilityIds(
    [
      ...middlewareScope.enabled,
      ...middlewareScope.disabled,
      ...middlewareScope.pipeline.map((entry) => entry.id),
    ],
    options?.knownCapabilityIds,
    'capabilities.middleware',
    issues,
  );

  validateLockedCore(middlewareScope, issues);
  validateToolConfigs(toolsScope, options?.knownCapabilityIds, issues);

  if (issues.length > 0) {
    throw new ProfileValidationError(issues);
  }

  return {
    name,
    provider: provider!,
    model: model.trim(),
    systemPrompt,
    theme: theme as ChatProfile['theme'],
    toolPolicy: policy,
    storageDir: path.resolve(storageDir),
    capabilities: {
      tools: {
        enabled: toolsScope.enabled.length > 0 ? toolsScope.enabled : defaultCapabilities.tools.enabled,
        disabled: toolsScope.disabled,
        config: Object.keys(toolsScope.config).length > 0
          ? cloneToolConfigMap(toolsScope.config)
          : cloneToolConfigMap(defaultCapabilities.tools.config),
      },
      skills: {
        enabled: skillsScope.enabled,
        disabled: skillsScope.disabled,
        directories: skillsScope.directories.length > 0 ? skillsScope.directories : defaultCapabilities.skills.directories,
      },
      middleware: {
        enabled: middlewareScope.enabled.length > 0 ? middlewareScope.enabled : defaultCapabilities.middleware.enabled,
        disabled: middlewareScope.disabled,
        pipeline: middlewareScope.pipeline.length > 0 ? middlewareScope.pipeline : defaultCapabilities.middleware.pipeline,
      },
    },
  };
}

export async function loadResolvedProfile(options?: ProfileLoadOptions): Promise<ChatProfile> {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const defaults = defaultChatProfile({ cwd, homeDir });

  const globalPath = options?.globalPath || getGlobalProfilePath(homeDir);
  const projectPath = options?.projectPath || getProjectProfilePath(cwd);

  const globalProfile = await readOptionalProfile(globalPath);
  const projectProfile = await readOptionalProfile(projectPath);
  const hasExplicitProvider = globalProfile?.provider !== undefined || projectProfile?.provider !== undefined;
  const hasExplicitModel = globalProfile?.model !== undefined || projectProfile?.model !== undefined;

  const mergedRecord = mergeRecords(mergeRecords(defaults as unknown as Record<string, unknown>, globalProfile), projectProfile);
  const resolved = validateAndNormalizeProfile(mergedRecord, defaults, {
    knownCapabilityIds: options?.knownCapabilityIds,
    cwd,
    homeDir,
  });
  let installedCache: string[] | undefined;
  const loadInstalled = async (): Promise<string[]> => {
    if (installedCache) {
      return installedCache;
    }
    installedCache = options?.installedOllamaModels || await getInstalledOllamaModels({ cwd });
    return installedCache;
  };

  if (!hasExplicitProvider) {
    const installed = await loadInstalled();
    const selected = selectPreferredOllamaModel(installed);
    if (!selected) {
      return resolved;
    }
    return { ...resolved, provider: 'ollama', model: selected };
  }

  if (resolved.provider !== 'ollama' || hasExplicitModel) {
    return resolved;
  }
  const installed = await loadInstalled();
  const selected = selectPreferredOllamaModel(installed);
  if (!selected) {
    return resolved;
  }
  return { ...resolved, model: selected };
}

export async function updateProjectProfile(
  updates: Partial<Pick<ChatProfile, 'provider' | 'model' | 'systemPrompt'>>,
  options?: ProfileLoadOptions,
): Promise<ChatProfile> {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const globalPath = options?.globalPath || getGlobalProfilePath(homeDir);
  const projectPath = options?.projectPath || getProjectProfilePath(cwd);

  const existingProject = (await readOptionalProfile(projectPath)) || {};
  const nextProject: Record<string, unknown> = { ...existingProject };
  if (updates.provider) {
    nextProject.provider = updates.provider;
  }
  if (updates.model !== undefined) {
    nextProject.model = updates.model;
  }
  if (updates.systemPrompt !== undefined) {
    nextProject.systemPrompt = updates.systemPrompt;
  }

  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await fs.writeFile(projectPath, `${JSON.stringify(nextProject, null, 2)}\n`, 'utf8');

  return await loadResolvedProfile({ cwd, homeDir, globalPath, projectPath, knownCapabilityIds: options?.knownCapabilityIds });
}

export async function persistSystemPrompt(
  systemPrompt: string,
  scope: 'project' | 'global',
  options?: ProfileLoadOptions,
): Promise<ChatProfile> {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const targetPath = scope === 'global'
    ? (options?.globalPath || getGlobalProfilePath(homeDir))
    : (options?.projectPath || getProjectProfilePath(cwd));

  const existing = (await readOptionalProfile(targetPath)) || {};
  const nextRecord: Record<string, unknown> = {
    ...existing,
    systemPrompt,
  };

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8');
  return await loadResolvedProfile({
    cwd,
    homeDir,
    globalPath: options?.globalPath,
    projectPath: options?.projectPath,
    knownCapabilityIds: options?.knownCapabilityIds,
  });
}

export async function persistCapabilityOverride(
  updates: CapabilityOverrideInput,
  scope: 'project' | 'global',
  options?: ProfileLoadOptions,
): Promise<ChatProfile> {
  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const targetPath = scope === 'global'
    ? (options?.globalPath || getGlobalProfilePath(homeDir))
    : (options?.projectPath || getProjectProfilePath(cwd));

  const existing = (await readOptionalProfile(targetPath)) || {};
  const existingCapabilities = asRecord(existing.capabilities) || {};
  const nextCapabilities: Record<string, unknown> = { ...existingCapabilities };

  const assignScope = (key: keyof ChatCapabilityConfig) => {
    const current = asRecord(existingCapabilities[key]) || {};
    const incoming = updates[key];
    if (!incoming) {
      return;
    }
    const mergedScope: Record<string, unknown> = {
      ...current,
      ...incoming,
    };
    if ('enabled' in incoming || 'disabled' in incoming) {
      const currentEnabled = new Set(normalizeIdList(current.enabled));
      const currentDisabled = new Set(normalizeIdList(current.disabled));
      const incomingEnabled = normalizeIdList((incoming as { enabled?: unknown }).enabled);
      const incomingDisabled = normalizeIdList((incoming as { disabled?: unknown }).disabled);
      for (const id of incomingEnabled) {
        currentEnabled.add(id);
        currentDisabled.delete(id);
      }
      for (const id of incomingDisabled) {
        currentDisabled.add(id);
        currentEnabled.delete(id);
      }
      mergedScope.enabled = [...currentEnabled];
      mergedScope.disabled = [...currentDisabled];
    }
    if (key === 'tools') {
      const currentConfig = parseToolConfigMap(current.config);
      const incomingConfig = parseToolConfigMap((incoming as Partial<ToolsScopeConfig>).config);
      const mergedConfig: Record<string, Record<string, unknown>> = { ...currentConfig };
      for (const [toolId, toolConfig] of Object.entries(incomingConfig)) {
        mergedConfig[toolId] = {
          ...(currentConfig[toolId] || {}),
          ...toolConfig,
        };
      }
      mergedScope.config = mergedConfig;
    }
    nextCapabilities[key] = mergedScope;
  };

  assignScope('tools');
  assignScope('skills');
  assignScope('middleware');

  const nextRecord: Record<string, unknown> = {
    ...existing,
    capabilities: nextCapabilities,
  };
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8');
  return await loadResolvedProfile({
    cwd,
    homeDir,
    globalPath: options?.globalPath,
    projectPath: options?.projectPath,
    knownCapabilityIds: options?.knownCapabilityIds,
  });
}

export async function persistAllowCommandPrefix(
  prefix: string,
  scope: 'project' | 'global',
  options?: ProfileLoadOptions,
): Promise<ChatProfile> {
  const trimmed = prefix.trim();
  if (!trimmed) {
    throw new Error('E6511: Command prefix must be non-empty.');
  }

  const cwd = options?.cwd || process.cwd();
  const homeDir = options?.homeDir || os.homedir();
  const targetPath = scope === 'global'
    ? (options?.globalPath || getGlobalProfilePath(homeDir))
    : (options?.projectPath || getProjectProfilePath(cwd));

  const existing = (await readOptionalProfile(targetPath)) || {};
  const currentPolicy = asRecord(existing.toolPolicy) || {};
  const currentAllow = normalizeIdList(currentPolicy.allowCommandPrefixes);
  const merged = [...new Set([...currentAllow, trimmed])];

  const nextRecord: Record<string, unknown> = {
    ...existing,
    toolPolicy: {
      ...currentPolicy,
      allowCommandPrefixes: merged,
    },
  };

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8');

  return await loadResolvedProfile({
    cwd,
    homeDir,
    globalPath: options?.globalPath,
    projectPath: options?.projectPath,
    knownCapabilityIds: options?.knownCapabilityIds,
  });
}
