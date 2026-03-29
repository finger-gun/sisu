import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type ToolPolicy, mergeToolPolicy } from './tool-policy.js';

export type ChatProviderId = 'mock' | 'openai' | 'anthropic' | 'ollama';

export interface ChatProfile {
  name: string;
  provider: ChatProviderId;
  model: string;
  theme: 'auto' | 'color' | 'plain';
  toolPolicy: ToolPolicy;
  storageDir: string;
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
}

export const PROFILE_FILE_NAME = 'chat-profile.json';

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
    model: 'sisu-mock-chat-v1',
    theme: 'auto',
    toolPolicy: mergeToolPolicy(),
    storageDir: path.join(homeDir, '.sisu', 'chat-sessions', path.basename(cwd)),
  };
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
  return merged;
}

function asProvider(value: unknown): ChatProviderId | undefined {
  if (value === 'mock' || value === 'openai' || value === 'anthropic' || value === 'ollama') {
    return value;
  }
  return undefined;
}

export function validateAndNormalizeProfile(input: Record<string, unknown>, defaults: ChatProfile): ChatProfile {
  const issues: ProfileValidationIssue[] = [];

  const provider = input.provider === undefined ? defaults.provider : asProvider(input.provider);
  if (!provider) {
    issues.push({ field: 'provider', message: 'Must be one of: mock, openai, anthropic, ollama.' });
  }

  const model = input.model === undefined ? defaults.model : String(input.model);
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

  if (issues.length > 0) {
    throw new ProfileValidationError(issues);
  }

  return {
    name,
    provider: provider!,
    model: model.trim(),
    theme: theme as ChatProfile['theme'],
    toolPolicy: policy,
    storageDir: path.resolve(storageDir),
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

  const mergedRecord = mergeRecords(mergeRecords(defaults as unknown as Record<string, unknown>, globalProfile), projectProfile);
  return validateAndNormalizeProfile(mergedRecord, defaults);
}
