import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Interface as ReadlineInterface } from 'node:readline/promises';
import { createInterface as createPromisesInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Writable } from 'node:stream';
import type { Readable } from 'node:stream';
import { InMemoryKV, SimpleTools, compose, createRedactingLogger } from '@sisu-ai/core';
import type {
  Ctx as MiddlewareCtx,
  GenerateOptions,
  LLM,
  Logger,
  Memory,
  Message,
  Middleware as RuntimeMiddleware,
  ModelEvent,
  ModelResponse,
  Tool,
  ToolCall,
  ToolChoice,
  ToolContext,
} from '@sisu-ai/core';
import { openAIAdapter, openAIEmbeddings } from '@sisu-ai/adapter-openai';
import { anthropicAdapter, anthropicEmbeddings } from '@sisu-ai/adapter-anthropic';
import { ollamaAdapter, ollamaEmbeddings } from '@sisu-ai/adapter-ollama';
import { createTerminalTool } from '@sisu-ai/tool-terminal';
import type { TerminalToolConfig } from '@sisu-ai/tool-terminal';
import ora from 'ora';
import prompts from 'prompts';
import {
  type ChatCommandResult,
  type ChatEvent,
  type ChatMessage,
  type ChatRun,
  type ChatRunSummary,
  type ToolExecutionRecord,
} from './events.js';
import { type ChatState, applyChatEvent, createChatState, upsertChatRun } from './state.js';
import {
  type ChatProfile,
  type ChatProviderId,
  type ProfileLoadOptions,
  defaultChatProfile,
  ensureCapabilityDefaults,
  getInstalledOllamaModels,
  getGlobalProfilePath,
  getProjectProfilePath,
  loadResolvedProfile,
  persistAllowCommandPrefix,
  persistCapabilityOverride,
  persistSystemPrompt,
  type SkillsScopeConfig,
  suggestedModelForProvider,
  updateProjectProfile,
} from './profiles.js';
import { FileSessionStore, type ChatSessionSnapshot } from './session-store.js';
import { TerminalRenderer } from './renderer.js';
import { type ToolRequest, evaluateToolRequest } from './tool-policy.js';
import type { SessionStoreSearchResult } from './session-store.js';
import { renderMarkdownLines } from './markdown.js';
import {
  buildCapabilityRegistry,
  describeCapabilitySource,
  enforceLockedCoreMiddleware,
  isLockedMiddlewareCapability,
  resolveCapabilityState,
  type CapabilityConfig,
  type CapabilityEntry,
  type MiddlewarePipelineEntry,
} from './capabilities.js';
import { getMiddlewareConfigDescriptor, validateMiddlewareConfig } from './middleware/catalog.js';
import { getToolConfigDescriptor, validateToolConfig } from './tool-config.js';
import {
  listOfficialPackages,
  getDiscoveryDiagnostics,
  type OfficialCapabilityCategory,
} from './npm-discovery.js';
import {
  installCapabilityPackage,
  runInstallRecipe,
  type CapabilityInstallType,
  type CapabilityInstallScope,
  type InstallRecipeExecutionOptions,
} from './capability-install.js';

interface ProviderStreamInput {
  messages: Message[];
  signal: AbortSignal;
}

interface ProviderGenerateInput {
  messages: Message[];
  signal: AbortSignal;
  tools?: Tool[];
  toolChoice?: ToolChoice;
}

interface ProviderStreamEvent {
  type: 'delta' | 'done';
  text?: string;
}

export interface ChatProvider {
  id: string;
  streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamEvent>;
  generateResponse?(input: ProviderGenerateInput): Promise<ModelResponse>;
}

class MockStreamingProvider implements ChatProvider {
  id = 'mock';

  async *streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamEvent> {
    const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
    const prompt = lastUser?.content || '';
    const text = `Request processed: ${prompt}`;
    const tokens = text.split(/(\s+)/).filter((token) => token.length > 0);
    for (const token of tokens) {
      if (input.signal.aborted) {
        break;
      }
      yield { type: 'delta', text: token };
    }
    yield { type: 'done' };
  }

  async generateResponse(input: ProviderGenerateInput): Promise<ModelResponse> {
    const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
    return {
      message: {
        role: 'assistant',
        content: `Request processed: ${lastUser?.content || ''}`,
      },
    };
  }
}

export interface AdapterFactories {
  createOpenAI: (model: string) => LLM;
  createAnthropic: (model: string) => LLM;
  createOllama: (model: string) => LLM;
}

const DEFAULT_ADAPTER_FACTORIES: AdapterFactories = {
  createOpenAI: (model) => openAIAdapter({ model }),
  createAnthropic: (model) => anthropicAdapter({ model }),
  createOllama: (model) => ollamaAdapter({ model }),
};

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === 'object'
    && value !== null
    && Symbol.asyncIterator in value
    && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === 'function';
}

class LlmStreamingProvider implements ChatProvider {
  readonly id: string;

  private readonly llm: LLM;

  constructor(id: string, llm: LLM) {
    this.id = id;
    this.llm = llm;
  }

  async *streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamEvent> {
    const out = this.llm.generate(input.messages, {
      stream: true,
      toolChoice: 'none',
      signal: input.signal,
    });

    if (isAsyncIterable<ModelEvent>(out)) {
      let tokenSeen = false;
      for await (const event of out) {
        if (event.type === 'token') {
          tokenSeen = true;
          yield { type: 'delta', text: event.token };
          continue;
        }

        if (event.type === 'assistant_message' && !tokenSeen) {
          yield { type: 'delta', text: event.message.content };
        }
      }
      yield { type: 'done' };
      return;
    }

    const response = await out as ModelResponse;
    yield { type: 'delta', text: response.message.content };
    yield { type: 'done' };
  }

  async generateResponse(input: ProviderGenerateInput): Promise<ModelResponse> {
    const out = this.llm.generate(input.messages, {
      tools: input.tools,
      toolChoice: input.toolChoice,
      signal: input.signal,
    });

    if (isAsyncIterable<ModelEvent>(out)) {
      let content = '';
      let toolCalls: ToolCall[] | undefined;
      let reasoningDetails: unknown = undefined;
      for await (const event of out) {
        if (event.type === 'token') {
          content += event.token;
        } else if (event.type === 'tool_call') {
          toolCalls = [...(toolCalls || []), event.call];
        } else if (event.type === 'assistant_message') {
          content = event.message.content || content;
          if (event.message.tool_calls) {
            toolCalls = event.message.tool_calls;
          }
          if (event.message.reasoning_details !== undefined) {
            reasoningDetails = event.message.reasoning_details;
          }
        }
      }
      return {
        message: {
          role: 'assistant',
          content,
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          ...(reasoningDetails !== undefined ? { reasoning_details: reasoningDetails } : {}),
        },
      };
    }

    return await out as ModelResponse;
  }
}

export function computeNovelStreamDelta(existingText: string, incomingDelta: string): string {
  if (!incomingDelta) {
    return '';
  }
  if (!existingText) {
    return incomingDelta;
  }

  if (incomingDelta.startsWith(existingText)) {
    return incomingDelta.slice(existingText.length);
  }

  if (existingText.endsWith(incomingDelta)) {
    return '';
  }

  const maxOverlap = Math.min(existingText.length, incomingDelta.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existingText.slice(-overlap) === incomingDelta.slice(0, overlap)) {
      return incomingDelta.slice(overlap);
    }
  }

  return incomingDelta;
}

export function createProviderFromProfile(
  profile: ChatProfile,
  factories: AdapterFactories = DEFAULT_ADAPTER_FACTORIES,
): ChatProvider {
  if (profile.provider === 'mock') {
    return new MockStreamingProvider();
  }

  const map: Record<Exclude<ChatProviderId, 'mock'>, () => LLM> = {
    openai: () => factories.createOpenAI(profile.model),
    anthropic: () => factories.createAnthropic(profile.model),
    ollama: () => factories.createOllama(profile.model),
  };

  return new LlmStreamingProvider(profile.provider, map[profile.provider]());
}

async function suggestedModelsForProvider(provider: ChatProviderId, cwd: string): Promise<string[]> {
  if (provider === 'ollama') {
    const installed = await getInstalledOllamaModels({ cwd });
    if (installed.length > 0) {
      const preferred = suggestedModelForProvider('ollama', installed);
      return [preferred, ...installed].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);
    }
    return [suggestedModelForProvider('ollama', [])];
  }
  if (provider === 'openai') {
    return ['gpt-4o-mini', 'gpt-4.1', 'gpt-5-mini'];
  }
  if (provider === 'anthropic') {
    return ['claude-sonnet-4-20250514', 'claude-opus-4.1'];
  }
  return ['sisu-mock-chat-v1'];
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseToolRequests(prompt: string): ToolRequest[] {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return [];
  }

  const requests: ToolRequest[] = [];

  if (trimmed.startsWith('!')) {
    requests.push({
      id: createId('tool'),
      toolName: 'shell',
      command: trimmed.slice(1).trim(),
    });
    return requests;
  }

  const lines = trimmed.split('\n').map((line) => line.trim());
  for (const line of lines) {
    if (line.toLowerCase().startsWith('run:')) {
      requests.push({
        id: createId('tool'),
        toolName: 'shell',
        command: line.slice(4).trim(),
      });
    }
  }

  return requests;
}

function toObjectArgs(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function stringifyToolResult(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shellQuoteArg(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, '\'\\\'\'')}'`;
}

function configuredEditorCommand(): string | undefined {
  const editor = (process.env.VISUAL || process.env.EDITOR || '').trim();
  return editor.length > 0 ? editor : undefined;
}

function isTerminalEditorCommand(command: string): boolean {
  const tokenMatch = command.match(/^\s*(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const executable = tokenMatch?.[1] || tokenMatch?.[2] || tokenMatch?.[3] || command;
  const base = path.basename(executable).toLowerCase();
  const knownTerminalEditors = new Set([
    'hx',
    'helix',
    'vim',
    'nvim',
    'vi',
    'nano',
    'emacs',
    'kak',
    'kakoune',
    'micro',
    'pico',
    'joe',
  ]);
  if (knownTerminalEditors.has(base)) {
    return true;
  }
  return /\s-(?:nw|tty)\b/.test(command);
}

async function runShellCommand(command: string, signal: AbortSignal, cwd: string): Promise<{ exitCode: number; output: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdoutBuffer = '';
    let stderrBuffer = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (signal.aborted) {
        resolve({ exitCode: 130, output: 'Command cancelled.' });
        return;
      }
      const output = [stdoutBuffer.trim(), stderrBuffer.trim()].filter(Boolean).join('\n');
      resolve({ exitCode: code ?? 0, output: output.slice(0, 4000) });
    });
  });
}

function toSnapshot(state: ChatState, title: string): ChatSessionSnapshot {
  return {
    sessionId: state.sessionId,
    title,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    messages: state.messages,
    runs: state.runs,
    toolExecutions: state.toolExecutions,
    events: state.events,
  };
}

export interface ChatRuntimeOptions {
  profile?: ChatProfile;
  sessionStore?: FileSessionStore;
  provider?: ChatProvider;
  adapterFactories?: AdapterFactories;
  cwd?: string;
  now?: () => Date;
  sessionId?: string;
  confirmToolExecution?: (request: ToolRequest, reason: string) => Promise<boolean>;
  knownCapabilityIds?: string[];
}

type CapabilityScopeTarget = 'session' | 'project' | 'global';
const DEFAULT_TOOL_CALLING_MAX_ROUNDS = 16;

interface ListedCapability {
  id: string;
  type: 'tool' | 'skill' | 'middleware';
  enabled: boolean;
  source: string;
  overridden: boolean;
  lockedCore: boolean;
  description?: string;
  packageName?: string;
  packageVersion?: string;
}

type CapabilityCategory = 'tools' | 'skills' | 'middleware';

function capabilityTypeFromCategory(category: CapabilityCategory): ListedCapability['type'] {
  if (category === 'tools') return 'tool';
  if (category === 'skills') return 'skill';
  return 'middleware';
}

function parseScopeTarget(value: string | undefined): CapabilityScopeTarget | undefined {
  if (value === 'session' || value === 'project' || value === 'global') {
    return value;
  }
  return undefined;
}

function parseToolConfigCommandPayload(payload: string): {
  toolId: string;
  config: Record<string, unknown>;
  scope: CapabilityScopeTarget;
} {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error('Usage: /tool-config <tool-id> <json-object> [session|project|global]');
  }

  let scope: CapabilityScopeTarget = 'session';
  let body = trimmed;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2) {
    const maybeScope = parseScopeTarget(tokens[tokens.length - 1]);
    if (maybeScope) {
      scope = maybeScope;
      body = trimmed.slice(0, trimmed.lastIndexOf(tokens[tokens.length - 1])).trim();
    }
  }

  const firstSpace = body.indexOf(' ');
  if (firstSpace <= 0) {
    throw new Error('Usage: /tool-config <tool-id> <json-object> [session|project|global]');
  }
  const toolId = body.slice(0, firstSpace).trim();
  const configText = body.slice(firstSpace + 1).trim();
  if (!toolId || !configText) {
    throw new Error('Usage: /tool-config <tool-id> <json-object> [session|project|global]');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configText);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool config must be a JSON object.');
  }

  return {
    toolId,
    config: parsed as Record<string, unknown>,
    scope,
  };
}

function parseMiddlewareConfigCommandPayload(payload: string): {
  middlewareId: string;
  config: Record<string, unknown>;
  scope: CapabilityScopeTarget;
} {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error('Usage: /middleware-config <middleware-id> <json-object> [session|project|global]');
  }

  let scope: CapabilityScopeTarget = 'session';
  let body = trimmed;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2) {
    const maybeScope = parseScopeTarget(tokens[tokens.length - 1]);
    if (maybeScope) {
      scope = maybeScope;
      body = trimmed.slice(0, trimmed.lastIndexOf(tokens[tokens.length - 1])).trim();
    }
  }

  const firstSpace = body.indexOf(' ');
  if (firstSpace <= 0) {
    throw new Error('Usage: /middleware-config <middleware-id> <json-object> [session|project|global]');
  }
  const middlewareId = body.slice(0, firstSpace).trim();
  const configText = body.slice(firstSpace + 1).trim();
  if (!middlewareId || !configText) {
    throw new Error('Usage: /middleware-config <middleware-id> <json-object> [session|project|global]');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configText);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Middleware config must be a JSON object.');
  }

  return {
    middlewareId,
    config: parsed as Record<string, unknown>,
    scope,
  };
}

function parseSessionSystemPromptInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === 'none' || trimmed === 'default' || trimmed === 'clear') {
    return '';
  }
  return input;
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function asRuntimeMiddleware(
  candidate: unknown,
  config: Record<string, unknown>,
): RuntimeMiddleware | undefined {
  if (typeof candidate !== 'function') {
    return undefined;
  }

  if (candidate.length >= 2) {
    return candidate as RuntimeMiddleware;
  }

  try {
    const built = (candidate as (opts: Record<string, unknown>) => unknown)(config);
    if (typeof built === 'function') {
      return built as RuntimeMiddleware;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [];
}

function boolAt(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  if (!record) {
    return undefined;
  }
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function parseTerminalConfigInput(value: unknown): Partial<TerminalToolConfig> {
  const raw = asRecord(value);
  if (!raw) {
    return {};
  }

  const parsed: Partial<TerminalToolConfig> = {};
  const capabilities = asRecord(raw.capabilities);
  if (capabilities) {
    const next: Partial<TerminalToolConfig['capabilities']> = {};
    if (typeof capabilities.read === 'boolean') next.read = capabilities.read;
    if (typeof capabilities.write === 'boolean') next.write = capabilities.write;
    if (typeof capabilities.delete === 'boolean') next.delete = capabilities.delete;
    if (typeof capabilities.exec === 'boolean') next.exec = capabilities.exec;
    if (Object.keys(next).length > 0) parsed.capabilities = next as TerminalToolConfig['capabilities'];
  }

  const commands = asRecord(raw.commands);
  if (commands) {
    const allow = normalizeStringArray(commands.allow);
    if (allow) {
      parsed.commands = { allow };
    }
  }

  const execution = asRecord(raw.execution);
  if (execution) {
    const next: Partial<TerminalToolConfig['execution']> = {};
    if (typeof execution.timeoutMs === 'number' && Number.isFinite(execution.timeoutMs) && execution.timeoutMs > 0) {
      next.timeoutMs = Math.floor(execution.timeoutMs);
    }
    if (typeof execution.maxStdoutBytes === 'number' && Number.isFinite(execution.maxStdoutBytes) && execution.maxStdoutBytes > 0) {
      next.maxStdoutBytes = Math.floor(execution.maxStdoutBytes);
    }
    if (typeof execution.maxStderrBytes === 'number' && Number.isFinite(execution.maxStderrBytes) && execution.maxStderrBytes > 0) {
      next.maxStderrBytes = Math.floor(execution.maxStderrBytes);
    }
    const pathDirs = normalizeStringArray(execution.pathDirs);
    if (pathDirs) {
      next.pathDirs = pathDirs;
    }
    if (Object.keys(next).length > 0) parsed.execution = next as TerminalToolConfig['execution'];
  }

  if (typeof raw.allowPipe === 'boolean') {
    parsed.allowPipe = raw.allowPipe;
  }
  if (typeof raw.allowSequence === 'boolean') {
    parsed.allowSequence = raw.allowSequence;
  }

  const sessions = asRecord(raw.sessions);
  if (sessions) {
    const next: Partial<TerminalToolConfig['sessions']> = {};
    if (typeof sessions.enabled === 'boolean') next.enabled = sessions.enabled;
    if (typeof sessions.ttlMs === 'number' && Number.isFinite(sessions.ttlMs) && sessions.ttlMs > 0) {
      next.ttlMs = Math.floor(sessions.ttlMs);
    }
    if (typeof sessions.maxPerAgent === 'number' && Number.isFinite(sessions.maxPerAgent) && sessions.maxPerAgent > 0) {
      next.maxPerAgent = Math.floor(sessions.maxPerAgent);
    }
    if (Object.keys(next).length > 0) parsed.sessions = next as TerminalToolConfig['sessions'];
  }

  return parsed;
}

function resolveTerminalToolConfig(profile: ChatProfile, cwd: string): Partial<TerminalToolConfig> {
  const toolConfig = profile.capabilities?.tools?.config || {};
  const fromProfile = parseTerminalConfigInput(toolConfig.terminal);
  return {
    roots: [cwd],
    allowPipe: true,
    allowSequence: true,
    ...fromProfile,
  };
}

export class ChatRuntime {
  profile: ChatProfile;

  private readonly sessionStore: FileSessionStore;

  private provider: ChatProvider;

  private providerStartupError?: string;

  private readonly adapterFactories: AdapterFactories;

  private readonly providerLocked: boolean;

  private readonly cwd: string;

  private readonly now: () => Date;

  private state: ChatState;

  private readonly listeners = new Set<(event: ChatEvent) => void>();

  private activeAbortController?: AbortController;

  private readonly confirmToolExecution: (request: ToolRequest, reason: string) => Promise<boolean>;

  private lastSessionTitle = 'CLI Chat Session';

  private capabilityRegistry: Map<string, CapabilityEntry>;

  private capabilityDiagnostics: string[];

  private readonly globalProfilePath: string;

  private readonly projectProfilePath: string;

  private terminalTool: ReturnType<typeof createTerminalTool>;

  private externalToolBundles: LoadedExternalToolBundle[];

  private readonly toolMemory: Memory;

  private readonly toolLogger: Logger;

  private sessionCapabilityOverrides: CapabilityConfig = {};

  private validateMiddlewarePipelineOrThrow(
    pipeline: MiddlewarePipelineEntry[],
    context: 'startup' | 'update',
  ): void {
    const unknown = pipeline
      .filter((entry) => this.capabilityRegistry.get(entry.id)?.type !== 'middleware')
      .map((entry) => entry.id);
    if (unknown.length > 0) {
      const code = context === 'startup' ? 'E6512' : 'E6509';
      throw new Error(`${code}: Unknown middleware pipeline entries: ${unknown.join(', ')}`);
    }

    for (const entry of pipeline) {
      const capability = this.capabilityRegistry.get(entry.id);
      const isInstalledCustom = capability?.source === 'project'
        || capability?.source === 'global'
        || capability?.source === 'session'
        || capability?.source === 'custom';
      if (isInstalledCustom) {
        continue;
      }
      const issues = validateMiddlewareConfig(entry.id, entry.config || {});
      if (issues.length > 0) {
        const code = context === 'startup' ? 'E6513' : 'E6514';
        throw new Error(`${code}: ${issues.join(' ')}`);
      }
    }
  }

  private constructor(options: {
    profile: ChatProfile;
    state: ChatState;
    sessionStore: FileSessionStore;
    provider: ChatProvider;
    providerStartupError?: string;
    adapterFactories: AdapterFactories;
    providerLocked: boolean;
    cwd: string;
    now: () => Date;
    confirmToolExecution: (request: ToolRequest, reason: string) => Promise<boolean>;
    capabilityRegistry: Map<string, CapabilityEntry>;
    capabilityDiagnostics: string[];
    globalProfilePath: string;
    projectProfilePath: string;
    terminalTool: ReturnType<typeof createTerminalTool>;
    externalToolBundles: LoadedExternalToolBundle[];
  }) {
    this.profile = options.profile;
    this.sessionStore = options.sessionStore;
    this.provider = options.provider;
    this.providerStartupError = options.providerStartupError;
    this.adapterFactories = options.adapterFactories;
    this.providerLocked = options.providerLocked;
    this.cwd = options.cwd;
    this.now = options.now;
    this.state = options.state;
    this.confirmToolExecution = options.confirmToolExecution;
    this.capabilityRegistry = options.capabilityRegistry;
    this.capabilityDiagnostics = options.capabilityDiagnostics;
    this.globalProfilePath = options.globalProfilePath;
    this.projectProfilePath = options.projectProfilePath;
    this.terminalTool = options.terminalTool;
    this.externalToolBundles = options.externalToolBundles;
    this.toolMemory = new InMemoryKV();
    this.toolLogger = createRedactingLogger(console as unknown as Logger);
  }

  private refreshTerminalTool(): void {
    this.terminalTool = createTerminalTool(resolveTerminalToolConfig(this.profile, this.cwd));
  }

  static async create(options?: ChatRuntimeOptions): Promise<ChatRuntime> {
    const cwd = options?.cwd || process.cwd();
    const knownCapabilityIds = options?.knownCapabilityIds;
    let profile = options?.profile || (await loadResolvedProfile({ cwd, knownCapabilityIds }));
    let capabilities = ensureCapabilityDefaults(profile, { cwd });
    profile.capabilities = capabilities;
    const sessionStore = options?.sessionStore || new FileSessionStore(profile.storageDir);
    const now = options?.now || (() => new Date());
    const state = createChatState(options?.sessionId || createId('session'), isoNow(now));

    const confirm = options?.confirmToolExecution
      || (async () => false);

    let provider = options?.provider;
    let providerStartupError: string | undefined;
    if (!provider) {
      try {
        provider = createProviderFromProfile(profile, options?.adapterFactories);
      } catch (error) {
        providerStartupError = error instanceof Error ? error.message : String(error);
        provider = new MockStreamingProvider();
      }
    }

    const registryBuild = await buildCapabilityRegistry({
      cwd,
      skillDirectories: capabilities.skills.directories,
    });

    if (!options?.profile && !knownCapabilityIds) {
      const resolvedWithKnown = await loadResolvedProfile({
        cwd,
        knownCapabilityIds: [...registryBuild.registry.keys()],
      } as ProfileLoadOptions);
      profile = resolvedWithKnown;
      capabilities = ensureCapabilityDefaults(profile, { cwd });
      profile.capabilities = capabilities;
    }

    const diagnostics = registryBuild.skillDiagnostics.map((entry) => `${entry.path}: ${entry.error}`);
    const externalToolBundles = await loadInstalledExternalTools(cwd);
    const runtime = new ChatRuntime({
      profile,
      state,
      sessionStore,
      provider,
      providerStartupError,
      adapterFactories: options?.adapterFactories || DEFAULT_ADAPTER_FACTORIES,
      providerLocked: Boolean(options?.provider),
      cwd,
      now,
      confirmToolExecution: confirm,
      capabilityRegistry: registryBuild.registry,
      capabilityDiagnostics: diagnostics,
      globalProfilePath: getGlobalProfilePath(),
      projectProfilePath: getProjectProfilePath(cwd),
      terminalTool: createTerminalTool(resolveTerminalToolConfig(profile, cwd)),
      externalToolBundles,
    });
    if (options?.sessionId) {
      try {
        await runtime.resumeSession(options.sessionId);
      } catch {
        // keep requested id as fresh session if snapshot does not exist
      }
    }
    runtime.validateMiddlewarePipelineOrThrow(runtime.listMiddlewarePipeline(), 'startup');
    return runtime;
  }

  getProviderStartupError(): string | undefined {
    return this.providerStartupError;
  }

  private effectiveCapabilities(): ReturnType<typeof resolveCapabilityState> {
    const defaults = ensureCapabilityDefaults(defaultChatProfile({ cwd: this.cwd }));
    const profileCaps = ensureCapabilityDefaults(this.profile, { cwd: this.cwd });
    const state = resolveCapabilityState({
      defaults,
      project: profileCaps,
      session: this.sessionCapabilityOverrides,
    });
    this.validateMiddlewarePipelineOrThrow(state.middlewarePipeline, 'startup');
    enforceLockedCoreMiddleware(state.middlewarePipeline, state.enabled);
    return state;
  }

  getCapabilityDiagnostics(): string[] {
    return [...this.capabilityDiagnostics];
  }

  listCapabilities(type?: 'tool' | 'skill' | 'middleware'): ListedCapability[] {
    const effective = this.effectiveCapabilities();
    const defaults = ensureCapabilityDefaults(defaultChatProfile({ cwd: this.cwd }), { cwd: this.cwd });
    const defaultState = resolveCapabilityState({ defaults });
    return [...this.capabilityRegistry.values()]
      .filter((entry) => !type || entry.type === type)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        enabled: effective.enabled.has(entry.id) && !effective.disabled.has(entry.id),
        source: describeCapabilitySource(entry.source),
        overridden:
          (effective.enabled.has(entry.id) && !effective.disabled.has(entry.id))
          !== (defaultState.enabled.has(entry.id) && !defaultState.disabled.has(entry.id)),
        lockedCore: Boolean(entry.lockedCore),
        description: entry.description,
        packageName: entry.packageName,
        packageVersion: entry.packageVersion,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  isCapabilityEnabled(capabilityId: string): boolean {
    const effective = this.effectiveCapabilities();
    return effective.enabled.has(capabilityId) && !effective.disabled.has(capabilityId);
  }

  listAllowCommandPrefixes(): string[] {
    return [...this.profile.toolPolicy.allowCommandPrefixes];
  }

  private ensureCapabilityExists(capabilityId: string): CapabilityEntry {
    const found = this.capabilityRegistry.get(capabilityId);
    if (!found) {
      throw new Error(`E6505: Unknown capability '${capabilityId}'.`);
    }
    return found;
  }

  private applySessionCapabilityOverride(
    capabilityId: string,
    enabled: boolean,
    type: 'tool' | 'skill' | 'middleware',
  ): void {
    const key = type === 'tool' ? 'tools' : type === 'skill' ? 'skills' : 'middleware';
    const current = this.sessionCapabilityOverrides[key] || {};
    const nextEnabled = new Set(current.enabled || []);
    const nextDisabled = new Set(current.disabled || []);

    if (enabled) {
      nextEnabled.add(capabilityId);
      nextDisabled.delete(capabilityId);
    } else {
      nextDisabled.add(capabilityId);
      nextEnabled.delete(capabilityId);
    }

    this.sessionCapabilityOverrides = {
      ...this.sessionCapabilityOverrides,
      [key]: {
        ...current,
        enabled: [...nextEnabled],
        disabled: [...nextDisabled],
      },
    };
  }

  async setCapabilityEnabled(
    capabilityId: string,
    enabled: boolean,
    scope: CapabilityScopeTarget,
  ): Promise<{ profile?: ChatProfile; targetPath?: string }> {
    const capability = this.ensureCapabilityExists(capabilityId);
    if (capability.lockedCore && !enabled) {
      throw new Error(`E6506: Locked core capability '${capabilityId}' cannot be disabled.`);
    }

    if (scope === 'session') {
      this.applySessionCapabilityOverride(capabilityId, enabled, capability.type);
      this.effectiveCapabilities();
      return {};
    }

    const key = capability.type === 'tool' ? 'tools' : capability.type === 'skill' ? 'skills' : 'middleware';
    const profile = await persistCapabilityOverride(
      {
        [key]: {
          enabled: enabled ? [capabilityId] : [],
          disabled: enabled ? [] : [capabilityId],
        },
      },
      scope,
      { cwd: this.cwd, knownCapabilityIds: [...this.capabilityRegistry.keys()] },
    );
    profile.capabilities = ensureCapabilityDefaults(profile, { cwd: this.cwd });
    this.profile = profile;
    this.refreshTerminalTool();
    return {
      profile,
      targetPath: scope === 'global' ? this.globalProfilePath : this.projectProfilePath,
    };
  }

  listMiddlewarePipeline(): MiddlewarePipelineEntry[] {
    return this.effectiveCapabilities().middlewarePipeline;
  }

  getMiddlewareStartupSummary(): string {
    const effective = this.effectiveCapabilities();
    const pipeline = this.listMiddlewarePipeline()
      .filter((entry) => entry.enabled !== false)
      .filter((entry) => effective.enabled.has(entry.id) && !effective.disabled.has(entry.id));
    if (pipeline.length === 0) {
      return 'No middleware configured.';
    }
    const enabled = pipeline.map((entry) => entry.id);
    return `Middleware pipeline: ${enabled.join(' -> ')}`;
  }

  async setMiddlewarePipeline(
    pipeline: MiddlewarePipelineEntry[],
    scope: CapabilityScopeTarget,
  ): Promise<{ targetPath?: string }> {
    this.validateMiddlewarePipelineOrThrow(pipeline, 'update');

    if (scope === 'session') {
      this.sessionCapabilityOverrides = {
        ...this.sessionCapabilityOverrides,
        middleware: {
          ...(this.sessionCapabilityOverrides.middleware || {}),
          pipeline,
        },
      };
      this.effectiveCapabilities();
      return {};
    }

    const profile = await persistCapabilityOverride(
      { middleware: { pipeline } },
      scope,
      { cwd: this.cwd, knownCapabilityIds: [...this.capabilityRegistry.keys()] },
    );
    profile.capabilities = ensureCapabilityDefaults(profile, { cwd: this.cwd });
    this.profile = profile;
    this.refreshTerminalTool();
    return { targetPath: scope === 'global' ? this.globalProfilePath : this.projectProfilePath };
  }

  async setMiddlewareConfig(
    middlewareId: string,
    config: Record<string, unknown>,
    scope: CapabilityScopeTarget,
  ): Promise<{ targetPath?: string }> {
    const pipeline = this.listMiddlewarePipeline();
    const nextPipeline = pipeline.map((entry) => (
      entry.id === middlewareId
        ? { ...entry, config: { ...config } }
        : entry
    ));
    if (!nextPipeline.some((entry) => entry.id === middlewareId)) {
      nextPipeline.push({ id: middlewareId, enabled: true, config: { ...config } });
    }
    return await this.setMiddlewarePipeline(nextPipeline, scope);
  }

  async setSkillDirectories(
    directories: string[],
    scope: Exclude<CapabilityScopeTarget, 'session'>,
  ): Promise<{ targetPath?: string }> {
    const current = ensureCapabilityDefaults(this.profile, { cwd: this.cwd }).skills;
    const nextSkills: SkillsScopeConfig = {
      enabled: current.enabled,
      disabled: current.disabled,
      directories,
    };
    const profile = await persistCapabilityOverride(
      { skills: nextSkills },
      scope,
      { cwd: this.cwd, knownCapabilityIds: [...this.capabilityRegistry.keys()] },
    );
    profile.capabilities = ensureCapabilityDefaults(profile, { cwd: this.cwd });
    this.profile = profile;
    const rebuilt = await buildCapabilityRegistry({ cwd: this.cwd, skillDirectories: directories });
    this.capabilityRegistry = rebuilt.registry;
    this.capabilityDiagnostics = rebuilt.skillDiagnostics.map((entry) => `${entry.path}: ${entry.error}`);
    return { targetPath: scope === 'global' ? this.globalProfilePath : this.projectProfilePath };
  }

  async listOfficialCapabilityPackages(category: OfficialCapabilityCategory): Promise<Awaited<ReturnType<typeof listOfficialPackages>>> {
    return await listOfficialPackages(category, { allowNpmFallback: true });
  }

  getDiscoveryDiagnostics(): string[] {
    return getDiscoveryDiagnostics();
  }

  async installCapability(
    type: CapabilityInstallType,
    name: string,
    scope: CapabilityInstallScope,
  ): Promise<{ capabilityId: string; packageName: string; installDir: string; manifestPath: string }> {
    const installed = await installCapabilityPackage({
      type,
      name,
      scope,
      cwd: this.cwd,
    });
    await this.rebuildCapabilityRegistry();
    return {
      capabilityId: installed.record.id,
      packageName: installed.record.packageName,
      installDir: installed.record.installDir,
      manifestPath: installed.manifestPath,
    };
  }

  async installRecipe(
    recipeId: string,
    scope: CapabilityInstallScope,
    options?: InstallRecipeExecutionOptions,
  ): Promise<Awaited<ReturnType<typeof runInstallRecipe>>> {
    const result = await runInstallRecipe(
      {
        recipeId,
        scope,
        cwd: this.cwd,
      },
      options,
    );
    if (result.status === 'completed') {
      await this.rebuildCapabilityRegistry();
      for (const action of result.completedSteps) {
        if (action.kind === 'enable') {
          await this.setCapabilityEnabled(action.capabilityId, true, scope);
        } else if (action.kind === 'set-tool-config') {
          await this.setToolConfig(action.id, action.config, scope);
        } else if (action.kind === 'set-middleware-config') {
          await this.setMiddlewareConfig(action.id, action.config, scope);
        }
      }
    }
    return result;
  }

  private async rebuildCapabilityRegistry(): Promise<void> {
    const capabilities = ensureCapabilityDefaults(this.profile, { cwd: this.cwd });
    const rebuilt = await buildCapabilityRegistry({
      cwd: this.cwd,
      skillDirectories: capabilities.skills.directories,
    });
    this.capabilityRegistry = rebuilt.registry;
    this.capabilityDiagnostics = rebuilt.skillDiagnostics.map((entry) => `${entry.path}: ${entry.error}`);
    this.externalToolBundles = await loadInstalledExternalTools(this.cwd);
  }

  async addAllowCommandPrefix(
    prefix: string,
    scope: CapabilityScopeTarget,
  ): Promise<{ targetPath?: string; profile?: ChatProfile }> {
    if (scope === 'session') {
      const merged = [...new Set([...this.profile.toolPolicy.allowCommandPrefixes, prefix])];
      this.profile = {
        ...this.profile,
        toolPolicy: {
          ...this.profile.toolPolicy,
          allowCommandPrefixes: merged,
        },
      };
      return {};
    }

    const profile = await persistAllowCommandPrefix(prefix, scope, {
      cwd: this.cwd,
      knownCapabilityIds: [...this.capabilityRegistry.keys()],
    });
    profile.capabilities = ensureCapabilityDefaults(profile, { cwd: this.cwd });
    this.profile = profile;
    this.refreshTerminalTool();
    return {
      profile,
      targetPath: scope === 'global' ? this.globalProfilePath : this.projectProfilePath,
    };
  }

  async setToolConfig(
    toolId: string,
    config: Record<string, unknown>,
    scope: CapabilityScopeTarget,
  ): Promise<{ targetPath?: string; profile?: ChatProfile }> {
    const capability = this.ensureCapabilityExists(toolId);
    if (capability.type !== 'tool') {
      throw new Error(`E6516: Capability '${toolId}' is not a tool.`);
    }
    const issues = validateToolConfig(toolId, config);
    if (issues.length > 0) {
      throw new Error(`E6517: ${issues.join(' ')}`);
    }
    const current = this.profile.capabilities?.tools?.config || {};
    const mergedForTool = {
      ...(asRecord(current[toolId]) || {}),
      ...config,
    };

    const mergedConfig = {
      ...current,
      [toolId]: mergedForTool,
    };

    if (scope === 'session') {
      const capabilities = ensureCapabilityDefaults(this.profile, { cwd: this.cwd });
      this.profile = {
        ...this.profile,
        capabilities: {
          ...capabilities,
          tools: {
            ...capabilities.tools,
            config: mergedConfig,
          },
        },
      };
      this.refreshTerminalTool();
      return { profile: this.profile };
    }

    const profile = await persistCapabilityOverride(
      { tools: { config: mergedConfig } },
      scope,
      { cwd: this.cwd, knownCapabilityIds: [...this.capabilityRegistry.keys()] },
    );
    profile.capabilities = ensureCapabilityDefaults(profile, { cwd: this.cwd });
    this.profile = profile;
    this.refreshTerminalTool();
    return {
      profile,
      targetPath: scope === 'global' ? this.globalProfilePath : this.projectProfilePath,
    };
  }

  getToolConfig(toolId: string): Record<string, unknown> {
    const capability = this.ensureCapabilityExists(toolId);
    if (capability.type !== 'tool') {
      throw new Error(`E6516: Capability '${toolId}' is not a tool.`);
    }
    const cfg = this.profile.capabilities?.tools?.config?.[toolId];
    return asRecord(cfg) ? { ...cfg } : {};
  }

  describeToolConfig(toolId: string): string {
    const capability = this.capabilityRegistry.get(toolId);
    const descriptor = capability?.configMetadata || getToolConfigDescriptor(toolId);
    if (!descriptor) {
      throw new Error(`E6518: No config schema available for tool '${toolId}'.`);
    }
    const current = this.profile.capabilities?.tools?.config?.[toolId];
    const lines = [
      `${descriptor.title}: ${descriptor.description}`,
      'Available options:',
      ...descriptor.options.map((option) => `- ${option.path} (${option.type}) — ${option.description}`),
      'Presets:',
      ...descriptor.presets.map((preset) => `- ${preset.label}: ${preset.description} (${JSON.stringify(preset.config)})`),
      `Current override: ${JSON.stringify(current || {}, null, 2)}`,
    ];
    return lines.join('\n');
  }

  getToolConfigPresets(toolId: string): Array<{ id: string; label: string; description: string; config: Record<string, unknown> }> {
    const capability = this.capabilityRegistry.get(toolId);
    const descriptor = capability?.configMetadata || getToolConfigDescriptor(toolId);
    if (!descriptor) {
      return [];
    }
    return descriptor.presets.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      config: { ...preset.config },
    }));
  }

  getMiddlewareConfig(middlewareId: string): Record<string, unknown> {
    const pipelineEntry = this.listMiddlewarePipeline().find((entry) => entry.id === middlewareId);
    return pipelineEntry?.config ? { ...pipelineEntry.config } : {};
  }

  describeMiddlewareConfig(middlewareId: string): string {
    const descriptor = getMiddlewareConfigDescriptor(middlewareId);
    if (!descriptor) {
      throw new Error(`E6519: No config schema available for middleware '${middlewareId}'.`);
    }
    const current = this.getMiddlewareConfig(middlewareId);
    const lines = [
      `${descriptor.title}: ${descriptor.description}`,
      'Available options:',
      ...descriptor.options.map((option) => `- ${option.path} (${option.type}) — ${option.description}`),
      'Presets:',
      ...descriptor.presets.map((preset) => `- ${preset.label}: ${preset.description} (${JSON.stringify(preset.config)})`),
      `Current override: ${JSON.stringify(current || {}, null, 2)}`,
    ];
    return lines.join('\n');
  }

  getMiddlewareConfigPresets(
    middlewareId: string,
  ): Array<{ id: string; label: string; description: string; config: Record<string, unknown> }> {
    const descriptor = getMiddlewareConfigDescriptor(middlewareId);
    if (!descriptor) {
      return [];
    }
    return descriptor.presets.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      config: { ...preset.config },
    }));
  }

  getToolCallingMaxRounds(): number {
    const config = this.listMiddlewarePipeline().find((entry) => entry.id === 'tool-calling')?.config || {};
    const candidate = config.maxRounds;
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
      return candidate;
    }
    return DEFAULT_TOOL_CALLING_MAX_ROUNDS;
  }

  getConfigPath(scope: Exclude<CapabilityScopeTarget, 'session'>): string {
    return scope === 'global' ? this.globalProfilePath : this.projectProfilePath;
  }

  async openConfigInEditor(scope: Exclude<CapabilityScopeTarget, 'session'>): Promise<string> {
    const target = scope === 'global' ? this.globalProfilePath : this.projectProfilePath;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.access(target);
    } catch {
      await fs.writeFile(target, '{}\n', 'utf8');
    }

    const editor = configuredEditorCommand();
    if (!editor) {
      throw new Error('E6510: Set $EDITOR or $VISUAL to open config in editor.');
    }

    const ttyInput = process.stdin as Readable & {
      isTTY?: boolean;
      isRaw?: boolean;
      setRawMode?: (mode: boolean) => void;
    };
    const setRawMode = typeof ttyInput.setRawMode === 'function' ? ttyInput.setRawMode.bind(ttyInput) : undefined;
    const shouldRestoreRawMode = Boolean(ttyInput.isTTY && ttyInput.isRaw && setRawMode);
    if (shouldRestoreRawMode && setRawMode) {
      setRawMode(false);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(`${editor} ${shellQuoteArg(target)}`, {
          cwd: this.cwd,
          shell: true,
          stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(
            `E6511: Editor exited unsuccessfully (${code !== null ? `code ${code}` : 'unknown code'}${signal ? `, signal ${signal}` : ''}).`,
          ));
        });
      });
    } finally {
      if (shouldRestoreRawMode && setRawMode) {
        setRawMode(true);
      }
    }
    return target;
  }

  async setProvider(provider: ChatProviderId): Promise<ChatProfile> {
    if (this.providerLocked) {
      throw new Error('E6201: Runtime provider is locked and cannot be changed.');
    }
    const installed = provider === 'ollama' ? await getInstalledOllamaModels({ cwd: this.cwd }) : [];
    const nextModel = suggestedModelForProvider(provider, installed);
    const candidateProvider = createProviderFromProfile({
      ...this.profile,
      provider,
      model: nextModel,
    }, this.adapterFactories);
    const nextProfile = await updateProjectProfile(
      { provider, model: nextModel },
      { cwd: this.cwd },
    );
    this.profile = nextProfile;
    this.provider = candidateProvider;
    this.providerStartupError = undefined;
    return nextProfile;
  }

  async setModel(model: string): Promise<ChatProfile> {
    if (this.providerLocked) {
      throw new Error('E6202: Runtime provider is locked and model cannot be changed.');
    }
    const trimmed = model.trim();
    if (!trimmed) {
      throw new Error('E6203: Model must be non-empty.');
    }
    const candidateProvider = createProviderFromProfile({
      ...this.profile,
      model: trimmed,
    }, this.adapterFactories);
    const nextProfile = await updateProjectProfile(
      { provider: this.profile.provider, model: trimmed },
      { cwd: this.cwd },
    );
    this.profile = nextProfile;
    this.provider = candidateProvider;
    this.providerStartupError = undefined;
    return nextProfile;
  }

  async setSystemPrompt(
    systemPrompt: string,
    scope: CapabilityScopeTarget,
  ): Promise<{ profile: ChatProfile; targetPath?: string }> {
    const normalized = systemPrompt.trim().length > 0 ? systemPrompt : '';
    if (scope === 'session') {
      this.profile = {
        ...this.profile,
        systemPrompt: normalized,
      };
      return { profile: this.profile };
    }
    const profile = await persistSystemPrompt(
      normalized,
      scope === 'global' ? 'global' : 'project',
      { cwd: this.cwd, knownCapabilityIds: [...this.capabilityRegistry.keys()] },
    );
    profile.capabilities = ensureCapabilityDefaults(profile, { cwd: this.cwd });
    this.profile = profile;
    return {
      profile,
      targetPath: scope === 'global' ? this.globalProfilePath : this.projectProfilePath,
    };
  }

  async listSuggestedModels(provider = this.profile.provider): Promise<string[]> {
    return await suggestedModelsForProvider(provider, this.cwd);
  }

  async probeProvider(): Promise<void> {
    for await (const event of this.provider.streamResponse({
      messages: [{ role: 'user', content: 'health-check' }],
      signal: new AbortController().signal,
    })) {
      if (event.type === 'delta' || event.type === 'done') {
        return;
      }
      break;
    }
  }

  getState(): ChatState {
    return this.state;
  }

  async startNewSession(sessionId?: string): Promise<string> {
    const nextSessionId = sessionId || createId('session');
    const nowIso = isoNow(this.now);
    this.state = createChatState(nextSessionId, nowIso);
    this.lastSessionTitle = 'CLI Chat Session';
    await this.saveSession();
    return nextSessionId;
  }

  onEvent(listener: (event: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: ChatEvent): void {
    applyChatEvent(this.state, event, isoNow(this.now));
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private createRun(requestMessageId: string): ChatRun {
    return {
      id: createId('run'),
      sessionId: this.state.sessionId,
      requestMessageId,
      status: 'running',
      stepSummaries: [],
      startedAt: isoNow(this.now),
    };
  }

  private async saveSession(): Promise<void> {
    await this.sessionStore.saveSession(toSnapshot(this.state, this.lastSessionTitle));
    this.emit({
      type: 'session.saved',
      sessionId: this.state.sessionId,
      runId: this.state.activeRunId || 'none',
    });
  }

  async resumeSession(sessionId: string): Promise<void> {
    const snapshot = await this.sessionStore.getSession(sessionId);
    this.state = {
      sessionId: snapshot.sessionId,
      messages: snapshot.messages,
      runs: snapshot.runs,
      toolExecutions: snapshot.toolExecutions,
      events: snapshot.events,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      activeRunId: undefined,
    };
    this.lastSessionTitle = snapshot.title;
  }

  async searchSessions(query: string): Promise<Awaited<ReturnType<FileSessionStore['searchSessions']>>> {
    return await this.sessionStore.searchSessions(query);
  }

  async listSessions(): Promise<Awaited<ReturnType<FileSessionStore['listSessions']>>> {
    return await this.sessionStore.listSessions();
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = await this.sessionStore.deleteSession(sessionId);
    if (!deleted) {
      return false;
    }
    if (this.state.sessionId === sessionId) {
      await this.startNewSession();
    }
    return true;
  }

  async branchFromMessage(messageId: string): Promise<string> {
    const nowIso = isoNow(this.now);
    const snapshot = await this.sessionStore.branchSession(this.state.sessionId, messageId, nowIso);
    this.state = {
      sessionId: snapshot.sessionId,
      messages: snapshot.messages,
      runs: snapshot.runs,
      toolExecutions: snapshot.toolExecutions,
      events: snapshot.events,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      activeRunId: undefined,
    };
    this.lastSessionTitle = snapshot.title;
    return snapshot.sessionId;
  }

  cancelActiveRun(): boolean {
    if (!this.activeAbortController) {
      return false;
    }
    this.activeAbortController.abort();
    return true;
  }

  private buildRunSummary(run: ChatRun, status: ChatRunSummary['status'], failedStep?: string): ChatRunSummary {
    return {
      runId: run.id,
      requestMessageId: run.requestMessageId,
      status,
      completedSteps: run.stepSummaries.length,
      failedStep,
    };
  }

  private async maybeConfirmTool(request: ToolRequest, reason: string): Promise<boolean> {
    return await this.confirmToolExecution(request, reason);
  }

  private getTerminalTools(): Tool[] {
    const effective = this.effectiveCapabilities();
    const enabled = effective.enabled.has('terminal') && !effective.disabled.has('terminal');
    const tools: Tool[] = enabled ? [...this.terminalTool.tools] : [];
    for (const bundle of this.externalToolBundles) {
      if (!effective.enabled.has(bundle.id) || effective.disabled.has(bundle.id)) {
        continue;
      }
      tools.push(...bundle.tools);
    }
    return tools;
  }

  private createMiddlewareModel(signal: AbortSignal): LLM {
    return {
      name: `${this.provider.id}-chat-runtime`,
      capabilities: { functionCall: true, streaming: false },
      generate: ((messages: Message[], opts?: GenerateOptions) => this.generateAssistantResponse({
        messages,
        signal: opts?.signal || signal,
        tools: opts?.tools,
        toolChoice: opts?.toolChoice,
      })) as LLM['generate'],
    };
  }

  private activeMiddlewarePipeline(): MiddlewarePipelineEntry[] {
    const effective = this.effectiveCapabilities();
    const configured = this.listMiddlewarePipeline().filter((entry) => (
      entry.enabled !== false
      && effective.enabled.has(entry.id)
      && !effective.disabled.has(entry.id)
      && this.capabilityRegistry.get(entry.id)?.type === 'middleware'
    ));
    const seen = new Set(configured.map((entry) => entry.id));
    const appended: MiddlewarePipelineEntry[] = [];
    for (const capabilityId of effective.enabled) {
      if (seen.has(capabilityId) || effective.disabled.has(capabilityId)) {
        continue;
      }
      if (this.capabilityRegistry.get(capabilityId)?.type !== 'middleware') {
        continue;
      }
      appended.push({ id: capabilityId, enabled: true, config: {} });
    }
    return [...configured, ...appended];
  }

  private async importInstalledCapabilityModule(packageName: string): Promise<Record<string, unknown> | undefined> {
    const entrypoint = await resolveInstalledPackageEntrypoint(this.cwd, packageName);
    if (!entrypoint) {
      return undefined;
    }
    const loaded = await import(pathToFileURL(entrypoint).href);
    return loaded as Record<string, unknown>;
  }

  private async resolveMiddlewareById(
    middlewareId: string,
    config: Record<string, unknown>,
  ): Promise<RuntimeMiddleware> {
    if (
      middlewareId === 'error-boundary'
      || middlewareId === 'invariants'
      || middlewareId === 'register-tools'
      || middlewareId === 'tool-calling'
      || middlewareId === 'rag'
    ) {
      return async (_ctx, next) => {
        await next();
      };
    }

    if (middlewareId === 'conversation-buffer') {
      const maxMessages = typeof config.maxMessages === 'number' && Number.isInteger(config.maxMessages) && config.maxMessages > 0
        ? config.maxMessages
        : 60;
      return async (ctx, next) => {
        if (ctx.messages.length > maxMessages) {
          const firstSystem = ctx.messages[0]?.role === 'system' ? ctx.messages.slice(0, 1) : [];
          const tail = ctx.messages.slice(-maxMessages);
          ctx.messages = firstSystem.concat(tail);
        }
        await next();
      };
    }

    if (middlewareId === 'skills') {
      const entry = this.capabilityRegistry.get('skills');
      const packageName = entry?.packageName || '@sisu-ai/mw-skills';
      const mod = await this.importInstalledCapabilityModule(packageName);
      if (!mod) {
        throw new Error(`E6520: Enabled middleware '${middlewareId}' could not be loaded from '${packageName}'.`);
      }
      const configuredDirectories = Array.isArray(config.directories)
        ? config.directories.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : ensureCapabilityDefaults(this.profile, { cwd: this.cwd }).skills.directories;
      const directories = await filterExistingDirectories(configuredDirectories);
      if (typeof mod.skillsMiddleware === 'function') {
        const built = (mod.skillsMiddleware as (opts: Record<string, unknown>) => unknown)({ directories });
        if (typeof built === 'function') {
          return built as RuntimeMiddleware;
        }
      }
      const fallback = asRuntimeMiddleware(mod.default, { directories });
      if (fallback) {
        return fallback;
      }
      throw new Error(`E6520: Middleware module '${packageName}' does not export a valid middleware.`);
    }

    if (middlewareId === 'trace-viewer') {
      const entry = this.capabilityRegistry.get('trace-viewer');
      const packageName = entry?.packageName || '@sisu-ai/mw-trace-viewer';
      const mod = await this.importInstalledCapabilityModule(packageName);
      if (!mod) {
        throw new Error(`E6520: Enabled middleware '${middlewareId}' could not be loaded from '${packageName}'.`);
      }
      if (typeof mod.traceViewer === 'function') {
        const built = (mod.traceViewer as (opts: Record<string, unknown>) => unknown)(config);
        if (typeof built === 'function') {
          return built as RuntimeMiddleware;
        }
      }
      const fallback = asRuntimeMiddleware(mod.default, config);
      if (fallback) {
        return fallback;
      }
      throw new Error(`E6520: Middleware module '${packageName}' does not export a valid middleware.`);
    }

    const entry = this.capabilityRegistry.get(middlewareId);
    const packageName = entry?.packageName || `@sisu-ai/mw-${middlewareId}`;
    const mod = await this.importInstalledCapabilityModule(packageName);
    if (!mod) {
      throw new Error(`E6520: Enabled middleware '${middlewareId}' could not be loaded from '${packageName}'.`);
    }
    const candidates: unknown[] = [
      mod.default,
      mod.middleware,
      mod.createMiddleware,
      mod[middlewareId],
      mod[kebabToCamel(middlewareId)],
    ];
    for (const candidate of candidates) {
      const middleware = asRuntimeMiddleware(candidate, config);
      if (middleware) {
        return middleware;
      }
    }
    throw new Error(`E6520: Middleware module '${packageName}' does not export a valid middleware.`);
  }

  private async executeWithConfiguredMiddleware<T>(input: {
    prompt: string;
    conversation: Message[];
    signal: AbortSignal;
    runCore: (ctx: {
      messages: Message[];
      tools: Tool[];
      state: Record<string, unknown>;
      log: Logger;
    }) => Promise<T>;
  }): Promise<T> {
    const pipeline = this.activeMiddlewarePipeline();
    if (pipeline.length === 0) {
      return await input.runCore({
        messages: input.conversation,
        tools: this.getTerminalTools(),
        state: {},
        log: this.toolLogger,
      });
    }

    const tools = new SimpleTools();
    for (const tool of this.getTerminalTools()) {
      tools.register(tool);
    }

    const ctx: MiddlewareCtx = {
      input: input.prompt,
      messages: [...input.conversation],
      model: this.createMiddlewareModel(input.signal),
      tools,
      memory: this.toolMemory,
      stream: { write: () => {}, end: () => {} },
      state: {},
      signal: input.signal,
      log: this.toolLogger,
    };

    const middlewares: RuntimeMiddleware[] = [];
    for (const entry of pipeline) {
      try {
        middlewares.push(await this.resolveMiddlewareById(entry.id, entry.config || {}));
      } catch (error) {
        const capability = this.capabilityRegistry.get(entry.id);
        const locked = Boolean(capability?.lockedCore || isLockedMiddlewareCapability(entry.id));
        if (locked) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        ctx.log.warn?.(
          `[chat-runtime] Skipping middleware '${entry.id}' due to load failure`,
          { middleware: entry.id, error: message },
        );
      }
    }

    let executedCore = false;
    let output: T | undefined;
    const handler = compose<MiddlewareCtx>(middlewares);
    await handler(ctx, async () => {
      executedCore = true;
      output = await input.runCore({
        messages: ctx.messages,
        tools: ctx.tools.list(),
        state: ctx.state,
        log: ctx.log,
      });
    });

    if (!executedCore || output === undefined) {
      const shortCircuitAssistant = [...ctx.messages].reverse().find((message) => message.role === 'assistant');
      if (shortCircuitAssistant && typeof shortCircuitAssistant.content === 'string') {
        return {
          toolLoopExceeded: false,
          streamedContent: shortCircuitAssistant.content,
        } as T;
      }
      throw new Error('E6521: Middleware pipeline interrupted chat execution before response synthesis.');
    }
    return output;
  }

  private async executeTerminalToolCall(
    run: ChatRun,
    call: ToolCall,
    signal: AbortSignal,
    toolStepIndex: number,
  ): Promise<Message> {
    const callId = call.id || createId('toolcall');
    const args = toObjectArgs(call.arguments);
    const requestCommand = call.name === 'terminalRun'
      ? (typeof args.command === 'string' ? args.command : '')
      : call.name === 'terminalCd'
        ? `cd ${typeof args.path === 'string' ? args.path : '.'}`
        : `cat ${typeof args.path === 'string' ? args.path : ''}`;
    const step = `Execute tool step ${toolStepIndex}`;
    this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step });

    const request = {
      id: callId,
      toolName: 'shell' as const,
      command: requestCommand.slice(0, 2000),
    };
    const pendingRecord: ToolExecutionRecord = {
      id: request.id,
      sessionId: this.state.sessionId,
      runId: run.id,
      toolName: call.name,
      requestPreview: request.command.slice(0, 140),
      status: 'pending',
      createdAt: isoNow(this.now),
      updatedAt: isoNow(this.now),
    };
    this.emit({ type: 'tool.pending', sessionId: this.state.sessionId, runId: run.id, record: pendingRecord });

    const decision = evaluateToolRequest(request, this.profile.toolPolicy);
    if (decision.action === 'deny') {
      const deniedRecord: ToolExecutionRecord = {
        ...pendingRecord,
        status: 'denied',
        denialReason: decision.reason,
        updatedAt: isoNow(this.now),
        completedAt: isoNow(this.now),
      };
      this.emit({ type: 'tool.denied', sessionId: this.state.sessionId, runId: run.id, record: deniedRecord, reason: decision.reason });
      run.stepSummaries.push(`${step} (denied)`);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
      return {
        role: 'tool',
        tool_call_id: callId,
        name: call.name,
        content: stringifyToolResult({ error: decision.reason }),
      };
    }

    if (decision.action === 'confirm') {
      const confirmed = await this.maybeConfirmTool(request, decision.reason);
      if (!confirmed) {
        const deniedRecord: ToolExecutionRecord = {
          ...pendingRecord,
          status: 'denied',
          denialReason: 'User denied action.',
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
        };
        this.emit({ type: 'tool.denied', sessionId: this.state.sessionId, runId: run.id, record: deniedRecord, reason: 'User denied action.' });
        run.stepSummaries.push(`${step} (user-denied)`);
        this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
        return {
          role: 'tool',
          tool_call_id: callId,
          name: call.name,
          content: stringifyToolResult({ error: 'User denied action.' }),
        };
      }
    }

    const runningRecord: ToolExecutionRecord = {
      ...pendingRecord,
      status: 'running',
      startedAt: isoNow(this.now),
      updatedAt: isoNow(this.now),
    };
    this.emit({ type: 'tool.running', sessionId: this.state.sessionId, runId: run.id, record: runningRecord });

    let toolResult: unknown;
    try {
      if (call.name === 'terminalRun') {
        toolResult = await this.terminalTool.run_command({
          command: typeof args.command === 'string' ? args.command : '',
          cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
          env: args.env && typeof args.env === 'object' && !Array.isArray(args.env)
            ? Object.fromEntries(Object.entries(args.env as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
            : undefined,
          stdin: typeof args.stdin === 'string' ? args.stdin : undefined,
          sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
        });
      } else if (call.name === 'terminalCd') {
        toolResult = this.terminalTool.cd({
          path: typeof args.path === 'string' ? args.path : '.',
          sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
        });
      } else if (call.name === 'terminalReadFile') {
        toolResult = await this.terminalTool.read_file({
          path: typeof args.path === 'string' ? args.path : '',
          encoding: args.encoding === 'base64' ? 'base64' : 'utf8',
          sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
        });
      } else {
        throw new Error(`Unsupported tool '${call.name}'.`);
      }
    } catch (error) {
      if (signal.aborted) {
        const cancelledRecord: ToolExecutionRecord = {
          ...runningRecord,
          status: 'cancelled',
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
        };
        this.emit({ type: 'tool.cancelled', sessionId: this.state.sessionId, runId: run.id, record: cancelledRecord });
        throw new Error('RUN_CANCELLED');
      }

      const message = error instanceof Error ? error.message : String(error);
      const failedRecord: ToolExecutionRecord = {
        ...runningRecord,
        status: 'failed',
        updatedAt: isoNow(this.now),
        completedAt: isoNow(this.now),
        exitCode: -1,
        outputPreview: message,
      };
      this.emit({
        type: 'tool.failed',
        sessionId: this.state.sessionId,
        runId: run.id,
        record: failedRecord,
        errorCode: 'TOOL_EXECUTION_FAILED',
        errorMessage: message,
      });
      run.stepSummaries.push(`${step} (failed)`);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
      return {
        role: 'tool',
        tool_call_id: callId,
        name: call.name,
        content: stringifyToolResult({ error: message }),
      };
    }

    const resultText = stringifyToolResult(toolResult);
    const completedRecord: ToolExecutionRecord = {
      ...runningRecord,
      status: 'completed',
      updatedAt: isoNow(this.now),
      completedAt: isoNow(this.now),
      exitCode: 0,
      outputPreview: resultText.slice(0, 4000),
    };
    this.emit({ type: 'tool.completed', sessionId: this.state.sessionId, runId: run.id, record: completedRecord });
    run.stepSummaries.push(step);
    this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });

    return {
      role: 'tool',
      tool_call_id: callId,
      name: call.name,
      content: resultText,
    };
  }

  private async maybeLoadRagDeps(): Promise<Record<string, unknown> | undefined> {
    const enabled = this.isCapabilityEnabled('tool-rag') || this.isCapabilityEnabled('rag');
    if (!enabled) {
      return undefined;
    }
    if (!this.capabilityRegistry.has('tool-rag')) {
      return undefined;
    }
    const ragToolConfig = this.getToolConfig('tool-rag');
    const ragPipelineConfig = this.listMiddlewarePipeline().find((entry) => entry.id === 'rag')?.config || {};
    const mergedConfig = {
      ...ragPipelineConfig,
      ...ragToolConfig,
    };
    const backend = selectBackendFromConfig(mergedConfig);
    const vectorPackage = resolveRagVectorPackage(mergedConfig, backend);
    const vectorEntrypoint = await resolveInstalledPackageEntrypoint(this.cwd, vectorPackage);
    if (!vectorEntrypoint) {
      return undefined;
    }
    const vectorModule = await import(pathToFileURL(vectorEntrypoint).href);
    const createVectra = (vectorModule as { createVectraVectorStore?: (opts?: Record<string, unknown>) => unknown }).createVectraVectorStore;
    const createChroma = (vectorModule as { createChromaVectorStore?: (opts?: Record<string, unknown>) => unknown }).createChromaVectorStore;
    const vectorStoreFactory = backend === 'chroma' ? createChroma : createVectra || createChroma;
    if (typeof vectorStoreFactory !== 'function') {
      return undefined;
    }
    const vectorStore = vectorStoreFactory({
      ...(backend === 'vectra'
        ? {
          folderPath: process.env.VECTRA_PATH || path.join(this.cwd, '.sisu-vectra'),
        }
        : {}),
      ...(backend === 'chroma'
        ? {
          chromaUrl: process.env.CHROMA_URL,
        }
        : {}),
      namespace: process.env.VECTOR_NAMESPACE || 'sisu',
    });
    if (!vectorStore || typeof vectorStore !== 'object') {
      return undefined;
    }

    let embeddings: unknown;
    try {
      if (this.profile.provider === 'openai') {
        embeddings = openAIEmbeddings({
          model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        });
      } else if (this.profile.provider === 'ollama') {
        embeddings = ollamaEmbeddings({
          model: process.env.EMBEDDING_MODEL || 'embeddinggemma',
        });
      } else if (this.profile.provider === 'anthropic') {
        const baseUrl = process.env.BASE_URL || process.env.OPENAI_BASE_URL;
        if (baseUrl) {
          embeddings = anthropicEmbeddings({
            baseUrl,
            model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
            apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY,
          });
        }
      }
    } catch {
      embeddings = undefined;
    }
    if (!embeddings || typeof embeddings !== 'object' || !('embed' in (embeddings as object))) {
      return { vectorStore };
    }
    return { vectorStore, embeddings };
  }

  private async executeGenericToolCall(
    run: ChatRun,
    call: ToolCall,
    signal: AbortSignal,
    toolStepIndex: number,
    availableTools?: Tool[],
    runtimeLog?: Logger,
    runtimeState?: Record<string, unknown>,
  ): Promise<Message> {
    const callId = call.id || createId('toolcall');
    const step = `Execute tool step ${toolStepIndex}`;
    this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step });

    const pendingRecord: ToolExecutionRecord = {
      id: callId,
      sessionId: this.state.sessionId,
      runId: run.id,
      toolName: call.name,
      requestPreview: JSON.stringify(call.arguments).slice(0, 140),
      status: 'pending',
      createdAt: isoNow(this.now),
      updatedAt: isoNow(this.now),
    };
    this.emit({ type: 'tool.pending', sessionId: this.state.sessionId, runId: run.id, record: pendingRecord });

    const runningRecord: ToolExecutionRecord = {
      ...pendingRecord,
      status: 'running',
      startedAt: isoNow(this.now),
      updatedAt: isoNow(this.now),
    };
    this.emit({ type: 'tool.running', sessionId: this.state.sessionId, runId: run.id, record: runningRecord });

    try {
      const tools = availableTools || this.getTerminalTools();
      const tool = tools.find((entry) => entry.name === call.name);
      if (!tool) {
        throw new Error(`Unsupported tool '${call.name}'.`);
      }
      const stateDeps = asRecord(runtimeState?.toolDeps);
      const deps = stateDeps || await this.maybeLoadRagDeps();
      const ctx: ToolContext = {
        memory: this.toolMemory,
        signal,
        log: runtimeLog || this.toolLogger,
        model: TOOL_CONTEXT_MODEL,
        ...(deps ? { deps } : {}),
      };
      const result = await tool.handler(toObjectArgs(call.arguments), ctx);
      const text = stringifyToolResult(result);
      const completedRecord: ToolExecutionRecord = {
        ...runningRecord,
        status: 'completed',
        updatedAt: isoNow(this.now),
        completedAt: isoNow(this.now),
        exitCode: 0,
        outputPreview: text.slice(0, 4000),
      };
      this.emit({ type: 'tool.completed', sessionId: this.state.sessionId, runId: run.id, record: completedRecord });
      run.stepSummaries.push(step);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
      return {
        role: 'tool',
        tool_call_id: callId,
        name: call.name,
        content: text,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedRecord: ToolExecutionRecord = {
        ...runningRecord,
        status: 'failed',
        updatedAt: isoNow(this.now),
        completedAt: isoNow(this.now),
        exitCode: -1,
        outputPreview: message,
      };
      this.emit({
        type: 'tool.failed',
        sessionId: this.state.sessionId,
        runId: run.id,
        record: failedRecord,
        errorCode: 'TOOL_EXECUTION_FAILED',
        errorMessage: message,
      });
      run.stepSummaries.push(`${step} (failed)`);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
      return {
        role: 'tool',
        tool_call_id: callId,
        name: call.name,
        content: stringifyToolResult({ error: message }),
      };
    }
  }

  private async generateAssistantResponse(input: {
    messages: Message[];
    signal: AbortSignal;
    tools?: Tool[];
    toolChoice?: ToolChoice;
  }): Promise<ModelResponse> {
    if (this.provider.generateResponse) {
      return await this.provider.generateResponse(input);
    }

    let content = '';
    for await (const event of this.provider.streamResponse({
      messages: input.messages,
      signal: input.signal,
    })) {
      if (input.signal.aborted) {
        throw new Error('RUN_CANCELLED');
      }
      if (event.type === 'delta' && event.text) {
        const delta = computeNovelStreamDelta(content, event.text);
        if (delta) {
          content += delta;
        }
      }
    }
    return { message: { role: 'assistant', content } };
  }

  private async runExplicitToolRequests(
    run: ChatRun,
    requests: ToolRequest[],
    signal: AbortSignal,
  ): Promise<string[]> {
    const toolOutputs: string[] = [];
    const effective = this.effectiveCapabilities();
    const shellToolEnabled = effective.enabled.has('terminal') && !effective.disabled.has('terminal');

    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index];
      const step = `Execute tool step ${index + 1}`;
      this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step });

      const pendingRecord: ToolExecutionRecord = {
        id: request.id,
        sessionId: this.state.sessionId,
        runId: run.id,
        toolName: request.toolName,
        requestPreview: request.command.slice(0, 140),
        status: 'pending',
        createdAt: isoNow(this.now),
        updatedAt: isoNow(this.now),
      };

      this.emit({ type: 'tool.pending', sessionId: this.state.sessionId, runId: run.id, record: pendingRecord });

      if (!shellToolEnabled) {
        const deniedRecord: ToolExecutionRecord = {
          ...pendingRecord,
          status: 'denied',
          denialReason: "Capability 'terminal' is disabled.",
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
        };
        this.emit({
          type: 'tool.denied',
          sessionId: this.state.sessionId,
          runId: run.id,
          record: deniedRecord,
          reason: "Capability 'terminal' is disabled.",
        });
        run.stepSummaries.push(`${step} (disabled-capability)`);
        this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
        continue;
      }

      const decision = evaluateToolRequest(request, this.profile.toolPolicy);
      if (decision.action === 'deny') {
        const deniedRecord: ToolExecutionRecord = {
          ...pendingRecord,
          status: 'denied',
          denialReason: decision.reason,
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
        };
        this.emit({ type: 'tool.denied', sessionId: this.state.sessionId, runId: run.id, record: deniedRecord, reason: decision.reason });
        run.stepSummaries.push(`${step} (denied)`);
        this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
        continue;
      }

      if (decision.action === 'confirm') {
        const confirmed = await this.maybeConfirmTool(request, decision.reason);
        if (!confirmed) {
          const deniedRecord: ToolExecutionRecord = {
            ...pendingRecord,
            status: 'denied',
            denialReason: 'User denied action.',
            updatedAt: isoNow(this.now),
            completedAt: isoNow(this.now),
          };
          this.emit({ type: 'tool.denied', sessionId: this.state.sessionId, runId: run.id, record: deniedRecord, reason: 'User denied action.' });
          run.stepSummaries.push(`${step} (user-denied)`);
          this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
          continue;
        }
      }

      const runningRecord: ToolExecutionRecord = {
        ...pendingRecord,
        status: 'running',
        startedAt: isoNow(this.now),
        updatedAt: isoNow(this.now),
      };
      this.emit({ type: 'tool.running', sessionId: this.state.sessionId, runId: run.id, record: runningRecord });

      const result = await runShellCommand(request.command, signal, this.cwd);
      if (signal.aborted) {
        const cancelledRecord: ToolExecutionRecord = {
          ...runningRecord,
          status: 'cancelled',
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
        };
        this.emit({ type: 'tool.cancelled', sessionId: this.state.sessionId, runId: run.id, record: cancelledRecord });
        throw new Error('RUN_CANCELLED');
      }

      if (result.exitCode !== 0) {
        const failedRecord: ToolExecutionRecord = {
          ...runningRecord,
          status: 'failed',
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
          exitCode: result.exitCode,
          outputPreview: result.output,
        };
        this.emit({
          type: 'tool.failed',
          sessionId: this.state.sessionId,
          runId: run.id,
          record: failedRecord,
          errorCode: 'TOOL_EXIT_NON_ZERO',
          errorMessage: result.output || `Command exited with code ${result.exitCode}`,
        });
        toolOutputs.push(`Tool failed (${request.command}): ${result.output || `exit ${result.exitCode}`}`);
        run.stepSummaries.push(`${step} (failed)`);
      } else {
        const completedRecord: ToolExecutionRecord = {
          ...runningRecord,
          status: 'completed',
          updatedAt: isoNow(this.now),
          completedAt: isoNow(this.now),
          exitCode: result.exitCode,
          outputPreview: result.output,
        };
        this.emit({ type: 'tool.completed', sessionId: this.state.sessionId, runId: run.id, record: completedRecord });
        toolOutputs.push(`Tool output (${request.command}): ${result.output || '<no output>'}`);
        run.stepSummaries.push(step);
      }
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step });
    }

    return toolOutputs;
  }

  async runPrompt(prompt: string): Promise<ChatCommandResult> {
    const nowIso = isoNow(this.now);
    this.lastSessionTitle = prompt.slice(0, 80) || this.lastSessionTitle;
    const userMessage: ChatMessage = {
      id: createId('msg'),
      sessionId: this.state.sessionId,
      role: 'user',
      content: prompt,
      status: 'completed',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const run = this.createRun(userMessage.id);
    upsertChatRun(this.state, run, nowIso);

    this.emit({
      type: 'user.submitted',
      sessionId: this.state.sessionId,
      runId: run.id,
      message: userMessage,
    });

    const assistantMessage: ChatMessage = {
      id: createId('msg'),
      sessionId: this.state.sessionId,
      runId: run.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: isoNow(this.now),
      updatedAt: isoNow(this.now),
    };

    this.emit({
      type: 'assistant.message.started',
      sessionId: this.state.sessionId,
      runId: run.id,
      message: assistantMessage,
    });

    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    const toolRequests = parseToolRequests(prompt);

    try {
      const analyzeStep = 'Analyze request';
      this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step: analyzeStep });
      run.stepSummaries.push(analyzeStep);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step: analyzeStep });

      const synthesizeStep = 'Synthesize response';
      this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step: synthesizeStep });
      run.stepSummaries.push(synthesizeStep);

      let streamedContent = '';
      if (toolRequests.length > 0) {
        const toolOutputs = await this.runExplicitToolRequests(run, toolRequests, signal);
        this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step: synthesizeStep });
        const providerMessages = toProviderMessages(this.state.messages, assistantMessage.id, toolOutputs, this.profile.systemPrompt);
        for await (const event of this.provider.streamResponse({ messages: providerMessages, signal })) {
          if (signal.aborted) {
            throw new Error('RUN_CANCELLED');
          }
          if (event.type === 'delta' && event.text) {
            const delta = computeNovelStreamDelta(streamedContent, event.text);
            if (!delta) {
              continue;
            }
            streamedContent += delta;
            this.emit({
              type: 'assistant.token.delta',
              sessionId: this.state.sessionId,
              runId: run.id,
              messageId: assistantMessage.id,
              delta,
            });
          }
        }
      } else {
        const middlewareResult = await this.executeWithConfiguredMiddleware({
          prompt,
          conversation: toProviderMessages(this.state.messages, assistantMessage.id, [], this.profile.systemPrompt),
          signal,
          runCore: async ({ messages: conversation, tools, state, log }) => {
            let finalResponse: ModelResponse | undefined;
            let stepCounter = 1;
            const maxToolCallingRounds = this.getToolCallingMaxRounds();
            let toolLoopExceeded = false;

            for (let round = 0; round < maxToolCallingRounds; round += 1) {
              const response = await this.generateAssistantResponse({
                messages: conversation,
                signal,
                tools,
                toolChoice: tools.length > 0 ? 'auto' : 'none',
              });
              const assistantOut = response.message;
              const toolCalls = assistantOut.tool_calls || [];
              if (toolCalls.length === 0) {
                finalResponse = response;
                break;
              }

              conversation.push({
                role: 'assistant',
                content: assistantOut.content || '',
                ...(assistantOut.tool_calls ? { tool_calls: assistantOut.tool_calls } : {}),
                ...(assistantOut.reasoning_details !== undefined ? { reasoning_details: assistantOut.reasoning_details } : {}),
              });

              for (const call of toolCalls) {
                if (signal.aborted) {
                  throw new Error('RUN_CANCELLED');
                }
                const toolMessage = call.name === 'terminalRun' || call.name === 'terminalCd' || call.name === 'terminalReadFile'
                  ? await this.executeTerminalToolCall(run, call, signal, stepCounter)
                  : await this.executeGenericToolCall(run, call, signal, stepCounter, tools, log, state);
                stepCounter += 1;
                conversation.push(toolMessage);
              }
            }

            if (!finalResponse) {
              toolLoopExceeded = true;
              return {
                toolLoopExceeded,
                streamedContent: [
                  'I hit the maximum tool-calling rounds before reaching a final answer.',
                  'Please refine the request or provide more specific constraints so I can complete it in fewer tool steps.',
                ].join(' '),
              };
            }

            const streamed = finalResponse.message.content || '';
            conversation.push({
              role: 'assistant',
              content: streamed,
              ...(finalResponse.message.reasoning_details !== undefined
                ? { reasoning_details: finalResponse.message.reasoning_details }
                : {}),
            });
            return {
              toolLoopExceeded,
              streamedContent: streamed,
            };
          },
        });

        this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step: synthesizeStep });
        streamedContent = middlewareResult.streamedContent;
        if (streamedContent && !middlewareResult.toolLoopExceeded) {
          this.emit({
            type: 'assistant.token.delta',
            sessionId: this.state.sessionId,
            runId: run.id,
            messageId: assistantMessage.id,
            delta: streamedContent,
          });
        }
      }

      assistantMessage.content = streamedContent;
      assistantMessage.status = 'completed';
      assistantMessage.updatedAt = isoNow(this.now);
      this.emit({
        type: 'assistant.message.completed',
        sessionId: this.state.sessionId,
        runId: run.id,
        message: assistantMessage,
      });

      run.status = 'completed';
      run.completedAt = isoNow(this.now);
      upsertChatRun(this.state, run, isoNow(this.now));

      const summary = this.buildRunSummary(run, 'completed');
      this.emit({
        type: 'run.completed',
        sessionId: this.state.sessionId,
        runId: run.id,
        summary,
      });

      await this.saveSession();
      return { summary, assistantMessage };
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.message === 'RUN_CANCELLED')) {
        assistantMessage.status = 'cancelled';
        assistantMessage.updatedAt = isoNow(this.now);
        this.emit({
          type: 'assistant.message.cancelled',
          sessionId: this.state.sessionId,
          runId: run.id,
          message: assistantMessage,
        });

        run.status = 'cancelled';
        run.completedAt = isoNow(this.now);
        upsertChatRun(this.state, run, isoNow(this.now));

        const summary = this.buildRunSummary(run, 'cancelled');
        this.emit({
          type: 'run.cancelled',
          sessionId: this.state.sessionId,
          runId: run.id,
          summary,
        });

        await this.saveSession();
        return { summary, assistantMessage };
      }

      const message = error instanceof Error ? error.message : String(error);
      assistantMessage.status = 'failed';
      assistantMessage.updatedAt = isoNow(this.now);

      this.emit({
        type: 'assistant.message.failed',
        sessionId: this.state.sessionId,
        runId: run.id,
        message: assistantMessage,
        errorCode: 'RUN_FAILED',
        errorMessage: message,
      });

      run.status = 'failed';
      run.completedAt = isoNow(this.now);
      run.errorCode = 'RUN_FAILED';
      run.errorMessage = message;
      upsertChatRun(this.state, run, isoNow(this.now));

      const summary = this.buildRunSummary(run, 'failed');
      this.emit({
        type: 'run.failed',
        sessionId: this.state.sessionId,
        runId: run.id,
        summary,
        errorCode: 'RUN_FAILED',
        errorMessage: message,
      });

      this.emit({
        type: 'error.raised',
        sessionId: this.state.sessionId,
        runId: run.id,
        code: 'RUN_FAILED',
        message,
      });

      await this.saveSession();
      return { summary, assistantMessage };
    } finally {
      this.activeAbortController = undefined;
    }
  }
}

export interface ChatCliArgs {
  sessionId?: string;
  prompt?: string;
}

export function parseChatArgs(argv: string[]): ChatCliArgs {
  const parsed: ChatCliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--session') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --session');
      }
      parsed.sessionId = value;
      index += 1;
      continue;
    }

    if (token === '--prompt') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --prompt');
      }
      parsed.prompt = value;
      index += 1;
      continue;
    }

    if (token === '--ui' || token === '--ink') {
      throw new Error(`${token} is no longer supported. Use 'sisu chat' for interactive mode.`);
    }

    if (token === '--json') {
      continue;
    }

    throw new Error(`Unknown chat option: ${token}`);
  }

  return parsed;
}

const PROVIDER_CHOICES: ChatProviderId[] = ['ollama', 'openai', 'anthropic', 'mock'];

function asProviderChoice(value: string): ChatProviderId | undefined {
  if (value === 'ollama' || value === 'openai' || value === 'anthropic' || value === 'mock') {
    return value;
  }
  return undefined;
}

function formatCapabilityStateRow(capability: ListedCapability): string {
  const flags = [
    capability.enabled ? 'enabled' : 'disabled',
    `source:${capability.source}`,
    capability.overridden ? 'override' : 'inherited',
  ];
  if (capability.lockedCore) {
    flags.push('locked-core');
  }
  const pkg = capability.packageName
    ? ` ${capability.packageName}${capability.packageVersion ? `@${capability.packageVersion}` : ''}`
    : '';
  return `${capability.id}${pkg} (${flags.join(', ')})`;
}

function capabilityDisplayLabel(capability: ListedCapability): string {
  const bits: string[] = [capability.id, capability.enabled ? 'enabled' : 'disabled'];
  if (capability.lockedCore) {
    bits.push('locked-core');
  }
  return bits.join(' · ');
}

export type InkLineTone = 'normal' | 'muted' | 'info' | 'success' | 'warning' | 'error';

export interface InkTranscriptLine {
  text: string;
  tone: InkLineTone;
}

export interface InkAgentStatus {
  text: string;
  tone: InkLineTone;
}

export function initialInkAgentStatus(): InkAgentStatus {
  return { text: 'Idle', tone: 'muted' };
}

export function nextInkAgentStatus(current: InkAgentStatus, event: ChatEvent): InkAgentStatus {
  switch (event.type) {
    case 'assistant.message.started':
      return { text: 'Thinking…', tone: 'info' };
    case 'assistant.token.delta':
      return { text: 'Generating response…', tone: 'info' };
    case 'run.step.started':
      return { text: event.step || 'Working…', tone: 'info' };
    case 'tool.pending':
      return { text: `Preparing tool: ${event.record.toolName}`, tone: 'warning' };
    case 'tool.running':
      return { text: `Running tool: ${event.record.toolName}`, tone: 'warning' };
    case 'tool.completed':
      return { text: 'Thinking…', tone: 'info' };
    case 'tool.denied':
      return { text: `Tool denied: ${event.record.toolName}`, tone: 'warning' };
    case 'tool.cancelled':
      return { text: `Tool cancelled: ${event.record.toolName}`, tone: 'warning' };
    case 'tool.failed':
      return { text: `Tool failed: ${event.record.toolName}`, tone: 'error' };
    case 'assistant.message.failed':
      return { text: `Failed: ${event.errorCode}`, tone: 'error' };
    case 'assistant.message.cancelled':
      return { text: 'Cancelled', tone: 'warning' };
    case 'run.failed':
      return { text: `Failed: ${event.errorCode}`, tone: 'error' };
    case 'error.raised':
      return { text: `Error: ${event.code}`, tone: 'error' };
    case 'assistant.message.completed':
    case 'run.completed':
      return initialInkAgentStatus();
    case 'run.cancelled':
      return { text: 'Cancelled', tone: 'warning' };
    default:
      return current;
  }
}

function toInkHistoryLines(messages: ChatMessage[]): InkTranscriptLine[] {
  const lines: InkTranscriptLine[] = [];
  for (const message of messages) {
    if (message.role === 'assistant') {
      lines.push({ text: 'Assistant:', tone: 'success' });
      const rendered = renderMarkdownLines(message.content, {
        maxWidth: Math.max(40, (process.stdout.columns || 100) - 6),
      });
      if (rendered.length === 0) {
        lines.push({ text: '  <empty response>', tone: 'muted' });
      } else {
        lines.push(...rendered.map((line) => ({
          text: line.text.length > 0 ? `  ${line.text}` : '',
          tone: line.tone,
        })));
      }
      continue;
    }

    if (message.role === 'user') {
      const parts = message.content.split('\n');
      parts.forEach((part, index) => {
        lines.push({ text: index === 0 ? `You: ${part}` : `  ${part}`, tone: 'info' });
      });
      continue;
    }

    if (message.role === 'system') {
      lines.push({ text: `System: ${message.content}`, tone: 'muted' });
      continue;
    }

    lines.push({ text: `Tool: ${message.content}`, tone: 'muted' });
  }
  return lines;
}

function writeLoadedSessionHistory(output: Writable, messages: ChatMessage[]): void {
  output.write('Loaded session history:\n');
  if (messages.length === 0) {
    output.write('(empty session)\n');
    return;
  }

  for (const message of messages) {
    if (message.role === 'assistant') {
      output.write('Assistant:\n');
      const rendered = renderMarkdownLines(message.content, {
        maxWidth: Math.max(40, (process.stdout.columns || 100) - 4),
      });
      if (rendered.length === 0) {
        output.write('  <empty response>\n');
      } else {
        rendered.forEach((line) => {
          output.write(line.text.length > 0 ? `  ${line.text}\n` : '\n');
        });
      }
      continue;
    }

    const prefix = message.role === 'user' ? 'You' : message.role === 'system' ? 'System' : 'Tool';
    const parts = message.content.split('\n');
    parts.forEach((part, index) => {
      output.write(index === 0 ? `${prefix}: ${part}\n` : `  ${part}\n`);
    });
  }
}

export function toInkEventLines(event: ChatEvent): InkTranscriptLine[] {
  switch (event.type) {
    case 'user.submitted':
      return [];
    case 'assistant.message.started':
      return [];
    case 'assistant.token.delta':
      return [];
    case 'assistant.message.completed': {
      const rendered = renderMarkdownLines(event.message.content, {
        maxWidth: Math.max(40, (process.stdout.columns || 100) - 6),
      });
      if (rendered.length === 0) {
        return [{ text: 'Assistant: <empty response>', tone: 'muted' }];
      }
      return [
        { text: 'Assistant:', tone: 'success' },
        ...rendered.map((line) => ({
          text: line.text.length > 0 ? `  ${line.text}` : '',
          tone: line.tone,
        })),
      ];
    }
    case 'assistant.message.failed':
      return [{ text: `Assistant failed (${event.errorCode}): ${event.errorMessage}`, tone: 'error' }];
    case 'assistant.message.cancelled':
      return [{ text: 'Assistant response cancelled.', tone: 'warning' }];
    case 'run.step.started':
      return [];
    case 'run.step.completed':
      return [];
    case 'tool.pending':
      return [];
    case 'tool.running':
      return [];
    case 'tool.completed':
      return [];
    case 'tool.denied':
      return [{ text: `! Tool denied [${event.record.toolName}]: ${event.reason}`, tone: 'warning' }];
    case 'tool.failed':
      return [{ text: `X Tool failed [${event.record.toolName}]: ${event.errorMessage}`, tone: 'error' }];
    case 'tool.cancelled':
      return [{ text: `! Tool cancelled [${event.record.toolName}]`, tone: 'warning' }];
    case 'run.completed':
      return [];
    case 'run.failed':
      return [{ text: `Run failed: ${event.errorCode} - ${event.errorMessage}`, tone: 'error' }];
    case 'run.cancelled':
      return [{ text: 'Run cancelled.', tone: 'warning' }];
    case 'session.saved':
      return [];
    case 'error.raised':
      return [{ text: `Error [${event.code}]: ${event.message}`, tone: 'error' }];
    default:
      return [];
  }
}

function inkToneToColor(tone: InkLineTone): { color?: string; dimColor?: boolean } {
  switch (tone) {
    case 'muted':
      return { dimColor: true };
    case 'info':
      return { color: 'cyan' };
    case 'success':
      return { color: 'green' };
    case 'warning':
      return { color: 'yellow' };
    case 'error':
      return { color: 'red' };
    default:
      return {};
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readPipedPrompt(input: Readable): Promise<string | undefined> {
  const inputState = input as Readable & { isTTY?: boolean };
  if (inputState.isTTY) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk as Buffer);
    }
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text.length > 0 ? text : undefined;
}

export function isInkEraseKey(value: string, key: {
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
}): boolean {
  if (key.backspace || key.delete) {
    return true;
  }
  if (value === '\x7f' || value === '\b') {
    return true;
  }
  return Boolean(key.ctrl) && value.toLowerCase() === 'h';
}

export function isInkNewlineKey(value: string, key: {
  return?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}): boolean {
  if (key.return && (key.shift || key.meta)) {
    return true;
  }
  // Some terminals report Shift+Enter as LF with return=true but without shift=true.
  if (key.return && value === '\n') {
    return true;
  }
  // CSI-u style Shift+Enter sequence used by some terminal emulators.
  if (value === '\u001b[13;2u' || value === '\u001b[27;2;13~') {
    return true;
  }
  return Boolean(key.ctrl) && value.toLowerCase() === 'j';
}

interface InkMenuItem {
  label: string;
  run: () => Promise<void>;
}

interface InkInlinePrompt {
  prompt: string;
  cancelMessage: string;
  resolve: (value: string | undefined) => void;
}

type LoadedExternalToolBundle = {
  id: string;
  tools: Tool[];
};

const TOOL_CONTEXT_MODEL: LLM = {
  name: 'sisu-cli-tool-context-model',
  capabilities: {},
  generate: (() => {
    throw new Error('Tool context model is not available in CLI runtime.');
  }) as LLM['generate'],
};

function resolveScopeRoot(scope: CapabilityInstallScope, cwd: string): string {
  return scope === 'project'
    ? path.join(cwd, '.sisu')
    : path.join(os.homedir(), '.sisu');
}

async function loadCapabilityManifest(scopeRoot: string): Promise<{
  version: number;
  entries: Array<{ id: string; type: 'tool' | 'middleware'; packageName: string; installDir: string; installedAt: string }>;
} | undefined> {
  const manifestPath = path.join(scopeRoot, 'capabilities', 'manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      version?: number;
      entries?: Array<{ id: string; type: 'tool' | 'middleware'; packageName: string; installDir: string; installedAt: string }>;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return undefined;
    }
    return {
      version: 1,
      entries: parsed.entries,
    };
  } catch {
    return undefined;
  }
}

function resolvePackageEntrypoint(installDir: string, packageName: string): string | undefined {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve(packageName, { paths: [installDir] });
  } catch {
    return undefined;
  }
}

function toToolArray(candidate: unknown): Tool[] {
  if (Array.isArray(candidate)) {
    return candidate.filter((entry): entry is Tool => Boolean(entry) && typeof entry === 'object' && typeof (entry as Tool).name === 'string' && typeof (entry as Tool).handler === 'function');
  }
  if (candidate && typeof candidate === 'object' && typeof (candidate as Tool).name === 'string' && typeof (candidate as Tool).handler === 'function') {
    return [candidate as Tool];
  }
  return [];
}

async function loadInstalledExternalTools(
  cwd: string,
): Promise<LoadedExternalToolBundle[]> {
  const manifests = await Promise.all([
    loadCapabilityManifest(resolveScopeRoot('project', cwd)),
    loadCapabilityManifest(resolveScopeRoot('global', cwd)),
  ]);
  const entries = manifests
    .flatMap((manifest) => manifest?.entries || [])
    .filter((entry) => entry.type === 'tool');

  const unique = new Map<string, { packageName: string; installDir: string }>();
  for (const entry of entries) {
    if (!unique.has(entry.packageName)) {
      unique.set(entry.packageName, { packageName: entry.packageName, installDir: entry.installDir });
    }
  }

  const bundles: LoadedExternalToolBundle[] = [];
  for (const { packageName, installDir } of unique.values()) {
    const entrypoint = resolvePackageEntrypoint(installDir, packageName);
    if (!entrypoint) {
      continue;
    }
    try {
      const mod = await import(pathToFileURL(entrypoint).href);
      const tools = toToolArray((mod as Record<string, unknown>).default);
      if (tools.length > 0) {
        bundles.push({
          id: packageName.replace(/^@sisu-ai\//, ''),
          tools,
        });
      }
    } catch {
      // Ignore broken external tool packages at runtime; they remain visible in capabilities.
    }
  }
  return bundles;
}

async function filterExistingDirectories(directories: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const directory of directories) {
    try {
      const stat = await fs.stat(directory);
      if (stat.isDirectory()) {
        existing.push(directory);
      }
    } catch {
      // Ignore missing directories at runtime.
    }
  }
  return existing;
}

async function resolveInstalledPackageEntrypoint(cwd: string, packageName: string): Promise<string | undefined> {
  const require = createRequire(import.meta.url);
  const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const searchPaths: string[] = [
    path.join(resolveScopeRoot('project', cwd), 'capabilities', 'packages'),
    path.join(resolveScopeRoot('global', cwd), 'capabilities', 'packages'),
    cliDir,
    path.join(cliDir, 'node_modules'),
  ];
  const manifests = await Promise.all([
    loadCapabilityManifest(resolveScopeRoot('project', cwd)),
    loadCapabilityManifest(resolveScopeRoot('global', cwd)),
  ]);
  for (const manifest of manifests) {
    for (const entry of manifest?.entries || []) {
      searchPaths.push(entry.installDir);
    }
  }
  try {
    return require.resolve(packageName, { paths: searchPaths });
  } catch {
    const workspaceEntrypoint = await resolveWorkspacePackageEntrypoint(cwd, packageName);
    if (workspaceEntrypoint) {
      return workspaceEntrypoint;
    }
    const workspaceFromCliEntrypoint = await resolveWorkspacePackageEntrypoint(cliDir, packageName);
    if (workspaceFromCliEntrypoint) {
      return workspaceFromCliEntrypoint;
    }
    try {
      return require.resolve(packageName);
    } catch {
      return undefined;
    }
  }
}

async function resolveWorkspacePackageEntrypoint(cwd: string, packageName: string): Promise<string | undefined> {
  const workspaceRoot = await findWorkspaceRoot(cwd);
  if (!workspaceRoot) {
    return undefined;
  }
  const packageDir = await findWorkspacePackageDirectory(workspaceRoot, packageName);
  if (!packageDir) {
    return undefined;
  }
  const packageJsonPath = path.join(packageDir, 'package.json');
  try {
    const raw = await fs.readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { main?: unknown; module?: unknown };
    const candidates = [
      typeof parsed.main === 'string' ? parsed.main : undefined,
      typeof parsed.module === 'string' ? parsed.module : undefined,
      'dist/index.js',
      'index.js',
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));
    for (const relativePath of candidates) {
      const entrypoint = path.resolve(packageDir, relativePath);
      try {
        const stat = await fs.stat(entrypoint);
        if (stat.isFile()) {
          return entrypoint;
        }
      } catch {
        // Continue to next candidate.
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function findWorkspaceRoot(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, 'pnpm-workspace.yaml');
    try {
      const stat = await fs.stat(marker);
      if (stat.isFile()) {
        return current;
      }
    } catch {
      // Keep walking up.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function findWorkspacePackageDirectory(
  workspaceRoot: string,
  packageName: string,
): Promise<string | undefined> {
  const roots = ['packages', 'apps', 'tools', 'examples'];
  for (const rootName of roots) {
    const rootPath = path.join(workspaceRoot, rootName);
    const match = await scanDirectoryForWorkspacePackage(rootPath, packageName, 3);
    if (match) {
      return match;
    }
  }
  return undefined;
}

async function scanDirectoryForWorkspacePackage(
  directory: string,
  packageName: string,
  depth: number,
): Promise<string | undefined> {
  if (depth < 0) {
    return undefined;
  }
  const packageJsonPath = path.join(directory, 'package.json');
  try {
    const raw = await fs.readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { name?: unknown };
    if (parsed.name === packageName) {
      return directory;
    }
  } catch {
    // Directory is not a package or unreadable; continue.
  }
  if (depth === 0) {
    return undefined;
  }
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const match = await scanDirectoryForWorkspacePackage(
      path.join(directory, entry.name),
      packageName,
      depth - 1,
    );
    if (match) {
      return match;
    }
  }
  return undefined;
}

function selectBackendFromConfig(config: Record<string, unknown>): 'vectra' | 'chroma' | 'custom' {
  const backend = config.backend;
  if (backend === 'vectra' || backend === 'chroma' || backend === 'custom') {
    return backend;
  }
  return 'vectra';
}

function resolveRagVectorPackage(config: Record<string, unknown>, backend: 'vectra' | 'chroma' | 'custom'): string {
  if (typeof config.vectorPackage === 'string' && config.vectorPackage.trim().length > 0) {
    return config.vectorPackage.trim();
  }
  if (backend === 'chroma') {
    return '@sisu-ai/vector-chroma';
  }
  return '@sisu-ai/vector-vectra';
}

async function runInkChatCli(parsed: ChatCliArgs, io: { input: Readable; output: Writable }): Promise<void> {
  const React = await import('react');
  const ink = await import('ink');
  const { render, Box, Text, Static, useInput, useApp } = ink;
  const { createElement, useEffect, useRef, useState } = React;
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
  const statusPulseFrames = ['●', '◉', '○', '◉'] as const;

  const App = (): ReturnType<typeof createElement> => {
    const { exit } = useApp();
    const [transcript, setTranscript] = useState<Array<InkTranscriptLine & { id: string }>>([]);
    const [inputValue, setInputValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);
    const [spinnerFrame, setSpinnerFrame] = useState(0);
    const [cursorVisible, setCursorVisible] = useState(true);
    const [providerHealth, setProviderHealth] = useState<'checking' | 'ready' | 'error'>('checking');
    const [providerHealthText, setProviderHealthText] = useState('Checking provider...');
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuTitle, setMenuTitle] = useState('Options');
    const [menuItems, setMenuItems] = useState<InkMenuItem[]>([]);
    const [menuIndex, setMenuIndex] = useState(0);
    const [externalTaskActive, setExternalTaskActive] = useState(false);
    const [inlinePrompt, setInlinePrompt] = useState<InkInlinePrompt | undefined>(undefined);
    const [agentStatus, setAgentStatus] = useState<InkAgentStatus>(initialInkAgentStatus());
    const runtimeRef = useRef<ChatRuntime | undefined>(undefined);

    const appendLine = (text: string, tone: InkLineTone = 'normal') => {
      setTranscript((previous) => [...previous, { id: createId('ink-line'), text, tone }].slice(-250));
    };

    const appendLines = (lines: InkTranscriptLine[]) => {
      if (lines.length === 0) {
        return;
      }
      setTranscript((previous) => [
        ...previous,
        ...lines.map((line) => ({ id: createId('ink-line'), ...line })),
      ].slice(-250));
    };

    const appendMultiline = (text: string, tone: InkLineTone = 'muted') => {
      appendLines(text.split('\n').map((line) => ({ text: line, tone })));
    };

    const renderInputText = (prefix: string, value: string, cursor: string): string => {
      if (!value) {
        return `${prefix}${cursor}`;
      }
      const lines = value.split('\n');
      return lines
        .map((line, index) => {
          const start = index === 0 ? prefix : '  ';
          const withLine = `${start}${line}`;
          return index === lines.length - 1 ? `${withLine}${cursor}` : withLine;
        })
        .join('\n');
    };

    const openMenu = (title: string, items: InkMenuItem[]) => {
      if (items.length === 0) {
        appendLine('No options available right now.', 'muted');
        return;
      }
      setMenuTitle(title);
      setMenuItems(items);
      setMenuIndex(0);
      setMenuOpen(true);
    };

    const closeMenu = () => {
      setMenuOpen(false);
      setMenuItems([]);
      setMenuIndex(0);
    };

    const promptInlineInput = (
      prompt: string,
      cancelMessage: string,
      initialValue = '',
    ): Promise<string | undefined> => {
      setBusy(false);
      setInputValue(initialValue);
      return new Promise((resolve) => {
        setInlinePrompt({ prompt, cancelMessage, resolve });
      });
    };

    const probeProviderInBackground = (runtime: ChatRuntime) => {
      setProviderHealth('checking');
      setProviderHealthText('Checking provider...');
      void (async () => {
        try {
          await runtime.probeProvider();
          setProviderHealth('ready');
          setProviderHealthText('Provider ready');
        } catch (error) {
          const message = formatError(error);
          setProviderHealth('error');
          setProviderHealthText(message);
          appendLine(`Provider check failed: ${message}`, 'warning');
          appendLine('Use /provider or /model (or Ctrl+O) to recover.', 'muted');
        }
      })();
    };

    const openProviderMenu = async (): Promise<void> => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      const items: InkMenuItem[] = PROVIDER_CHOICES.map((provider) => ({
        label: provider === runtime.profile.provider ? `${provider} (current)` : provider,
        run: async () => {
          const next = await runtime.setProvider(provider);
          appendLine(`Provider updated: ${next.provider} / ${next.model}`, 'success');
          probeProviderInBackground(runtime);
        },
      }));
      openMenu('Select provider', items);
    };

    const openModelMenu = async (): Promise<void> => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      setBusy(true);
      try {
        const models = await runtime.listSuggestedModels(runtime.profile.provider);
        const items: InkMenuItem[] = models.map((model) => ({
          label: model === runtime.profile.model ? `${model} (current)` : model,
          run: async () => {
            const next = await runtime.setModel(model);
            appendLine(`Model updated: ${next.provider} / ${next.model}`, 'success');
            probeProviderInBackground(runtime);
          },
        }));
        openMenu(`Select model (${runtime.profile.provider})`, items);
      } catch (error) {
        appendLine(formatError(error), 'error');
      } finally {
        setBusy(false);
      }
    };

    const openSessionListMenu = async (): Promise<void> => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      setBusy(true);
      try {
        const sessions = await runtime.listSessions();
        if (sessions.length === 0) {
          appendLine('No saved sessions.', 'muted');
          return;
        }
        const items: InkMenuItem[] = sessions.slice(0, 25).map((session) => ({
          label: `${session.sessionId} · ${session.title || 'Untitled'}`,
          run: async () => {
            openMenu(`Session ${session.sessionId}`, [
              {
                label: 'Resume this session',
                run: async () => {
                  await runtime.resumeSession(session.sessionId);
                  appendLine(`Resumed session ${session.sessionId}.`, 'success');
                  appendLine('Loaded session history:', 'muted');
                  appendLines(toInkHistoryLines(runtime.getState().messages));
                },
              },
              {
                label: 'Delete this session',
                run: async () => {
                  const deleted = await runtime.deleteSession(session.sessionId);
                  appendLine(
                    deleted
                      ? `Deleted session ${session.sessionId}.`
                      : `Session not found: ${session.sessionId}.`,
                    deleted ? 'warning' : 'muted',
                  );
                },
              },
            ]);
          },
        }));
        openMenu('Sessions', items);
      } catch (error) {
        appendLine(formatError(error), 'error');
      } finally {
        setBusy(false);
      }
    };

    const openBranchMenu = async (): Promise<void> => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      const items: InkMenuItem[] = runtime
        .getState()
        .messages
        .filter((message) => message.role !== 'tool')
        .slice(-25)
        .reverse()
        .map((message) => ({
          label: `${message.id} · ${message.role}: ${message.content.slice(0, 48)}`,
          run: async () => {
            const branchId = await runtime.branchFromMessage(message.id);
            appendLine(`Created branch session ${branchId}.`, 'success');
          },
      }));
      openMenu('Branch from message', items);
    };

    const openToolPresetScopeMenu = (
      toolId: string,
      presetLabel: string,
      presetConfig: Record<string, unknown>,
    ): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      openMenu(`${toolId} · ${presetLabel}`, [
        {
          label: 'Apply (session)',
          run: async () => {
            const result = await runtime.setToolConfig(toolId, presetConfig, 'session');
            appendLine(`Applied ${presetLabel} preset to ${toolId} (session).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        {
          label: 'Apply (project)',
          run: async () => {
            const result = await runtime.setToolConfig(toolId, presetConfig, 'project');
            appendLine(`Applied ${presetLabel} preset to ${toolId} (project).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        {
          label: 'Apply (global)',
          run: async () => {
            const result = await runtime.setToolConfig(toolId, presetConfig, 'global');
            appendLine(`Applied ${presetLabel} preset to ${toolId} (global).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        { label: 'Back', run: async () => {} },
      ]);
    };

    const openMiddlewarePresetScopeMenu = (
      middlewareId: string,
      presetLabel: string,
      presetConfig: Record<string, unknown>,
    ): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      openMenu(`${middlewareId} · ${presetLabel}`, [
        {
          label: 'Apply (session)',
          run: async () => {
            const result = await runtime.setMiddlewareConfig(middlewareId, presetConfig, 'session');
            appendLine(`Applied ${presetLabel} preset to ${middlewareId} (session).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        {
          label: 'Apply (project)',
          run: async () => {
            const result = await runtime.setMiddlewareConfig(middlewareId, presetConfig, 'project');
            appendLine(`Applied ${presetLabel} preset to ${middlewareId} (project).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        {
          label: 'Apply (global)',
          run: async () => {
            const result = await runtime.setMiddlewareConfig(middlewareId, presetConfig, 'global');
            appendLine(`Applied ${presetLabel} preset to ${middlewareId} (global).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        { label: 'Back', run: async () => {} },
      ]);
    };

    const openToolConfigMenu = (toolId: string): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      const currentConfig = runtime.getToolConfig(toolId);
      const currentCommands = asRecord(currentConfig.commands);
      const commandsAllow = normalizeStringArray(currentCommands?.allow) || [];
      const allowPipe = boolAt(currentConfig, 'allowPipe') ?? true;
      const allowSequence = boolAt(currentConfig, 'allowSequence') ?? true;

      const updateToolConfigByScope = (
        toolIdForUpdate: string,
        config: Record<string, unknown>,
      ): void => {
        openMenu(`${toolIdForUpdate} · apply config`, [
          {
            label: 'Apply (session)',
            run: async () => {
              const result = await runtime.setToolConfig(toolIdForUpdate, config, 'session');
              appendLine(`Updated ${toolIdForUpdate} config (session).`, 'success');
              if (result.targetPath) {
                appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
              }
            },
          },
          {
            label: 'Apply (project)',
            run: async () => {
              const result = await runtime.setToolConfig(toolIdForUpdate, config, 'project');
              appendLine(`Updated ${toolIdForUpdate} config (project).`, 'success');
              if (result.targetPath) {
                appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
              }
            },
          },
          {
            label: 'Apply (global)',
            run: async () => {
              const result = await runtime.setToolConfig(toolIdForUpdate, config, 'global');
              appendLine(`Updated ${toolIdForUpdate} config (global).`, 'success');
              if (result.targetPath) {
                appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
              }
            },
          },
          { label: 'Back', run: async () => {} },
        ]);
      };

      const presets = runtime.getToolConfigPresets(toolId);
      const items: InkMenuItem[] = [
        ...presets.map((preset) => ({
          label: `Apply preset: ${preset.label}`,
          run: async () => {
            openToolPresetScopeMenu(toolId, preset.label, preset.config);
          },
        })),
        {
          label: `Edit commands.allow (${commandsAllow.length} entries)`,
          run: async () => {
            const value = await promptInlineInput(
              `commands.allow as CSV for ${toolId} (e.g. ls,cat,grep,touch,mkdir,cp,mv,rm):`,
              'commands.allow update cancelled.',
              commandsAllow.join(','),
            );
            if (!value) {
              return;
            }
            const parsed = value
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
            if (parsed.length === 0) {
              appendLine('commands.allow update cancelled.', 'muted');
              return;
            }
            updateToolConfigByScope(toolId, { commands: { allow: parsed } });
          },
        },
        {
          label: `Toggle allowPipe (current: ${allowPipe ? 'on' : 'off'})`,
          run: async () => {
            updateToolConfigByScope(toolId, { allowPipe: !allowPipe });
          },
        },
        {
          label: `Toggle allowSequence (current: ${allowSequence ? 'on' : 'off'})`,
          run: async () => {
            updateToolConfigByScope(toolId, { allowSequence: !allowSequence });
          },
        },
        {
          label: 'Show available options',
          run: async () => {
            appendMultiline(runtime.describeToolConfig(toolId), 'muted');
          },
        },
        { label: 'Back', run: async () => {} },
      ];
      openMenu(`Configure ${toolId}`, items);
    };

    const openMiddlewareConfigMenu = (middlewareId: string): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }

      const updateMiddlewareConfigByScope = (
        middlewareIdForUpdate: string,
        config: Record<string, unknown>,
      ): void => {
        openMenu(`${middlewareIdForUpdate} · apply config`, [
          {
            label: 'Apply (session)',
            run: async () => {
              const result = await runtime.setMiddlewareConfig(middlewareIdForUpdate, config, 'session');
              appendLine(`Updated ${middlewareIdForUpdate} config (session).`, 'success');
              if (result.targetPath) {
                appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
              }
            },
          },
          {
            label: 'Apply (project)',
            run: async () => {
              const result = await runtime.setMiddlewareConfig(middlewareIdForUpdate, config, 'project');
              appendLine(`Updated ${middlewareIdForUpdate} config (project).`, 'success');
              if (result.targetPath) {
                appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
              }
            },
          },
          {
            label: 'Apply (global)',
            run: async () => {
              const result = await runtime.setMiddlewareConfig(middlewareIdForUpdate, config, 'global');
              appendLine(`Updated ${middlewareIdForUpdate} config (global).`, 'success');
              if (result.targetPath) {
                appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
              }
            },
          },
          { label: 'Back', run: async () => {} },
        ]);
      };

      const presets = runtime.getMiddlewareConfigPresets(middlewareId);
      const items: InkMenuItem[] = [
        ...presets.map((preset) => ({
          label: `Apply preset: ${preset.label}`,
          run: async () => {
            openMiddlewarePresetScopeMenu(middlewareId, preset.label, preset.config);
          },
        })),
        {
          label: 'Edit config JSON',
          run: async () => {
            const current = runtime.getMiddlewareConfig(middlewareId);
            const value = await promptInlineInput(
              `JSON config for ${middlewareId} (object):`,
              `${middlewareId} config update cancelled.`,
              JSON.stringify(current, null, 2),
            );
            if (!value) {
              return;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(value);
            } catch (error) {
              appendLine(`Invalid JSON: ${formatError(error)}`, 'error');
              return;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              appendLine('Config must be a JSON object.', 'warning');
              return;
            }
            updateMiddlewareConfigByScope(middlewareId, parsed as Record<string, unknown>);
          },
        },
        {
          label: 'Show available options',
          run: async () => {
            appendMultiline(runtime.describeMiddlewareConfig(middlewareId), 'muted');
          },
        },
        ...(middlewareId === 'tool-calling'
          ? [{
            label: `Set maxRounds (current: ${runtime.getToolCallingMaxRounds()})`,
            run: async () => {
              const picked = await promptInlineInput(
                'maxRounds value (8, 16, 24, 32, or custom positive integer):',
                'maxRounds update cancelled.',
                String(runtime.getToolCallingMaxRounds()),
              );
              if (!picked) {
                return;
              }
              const parsed = Number.parseInt(picked.trim(), 10);
              if (!Number.isInteger(parsed) || parsed <= 0) {
                appendLine('Invalid maxRounds value.', 'warning');
                return;
              }
              updateMiddlewareConfigByScope(middlewareId, { maxRounds: parsed });
            },
          } satisfies InkMenuItem]
          : []),
        { label: 'Back', run: async () => {} },
      ];
      openMenu(`Configure ${middlewareId}`, items);
    };

    const openCapabilityActionMenu = (category: CapabilityCategory, capability: ListedCapability): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      const nextEnabled = !capability.enabled;
      const verb = nextEnabled ? 'Enable' : 'Disable';
      const items: InkMenuItem[] = [
        {
          label: `${verb} (session)`,
          run: async () => {
            const result = await runtime.setCapabilityEnabled(capability.id, nextEnabled, 'session');
            appendLine(`${nextEnabled ? 'Enabled' : 'Disabled'} ${capability.id} (session).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        {
          label: `${verb} (project)`,
          run: async () => {
            const result = await runtime.setCapabilityEnabled(capability.id, nextEnabled, 'project');
            appendLine(`${nextEnabled ? 'Enabled' : 'Disabled'} ${capability.id} (project).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        {
          label: `${verb} (global)`,
          run: async () => {
            const result = await runtime.setCapabilityEnabled(capability.id, nextEnabled, 'global');
            appendLine(`${nextEnabled ? 'Enabled' : 'Disabled'} ${capability.id} (global).`, 'success');
            if (result.targetPath) {
              appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
            }
          },
        },
        ...(capability.type === 'tool'
          ? [{
            label: 'Configure tool',
            run: async () => {
              openToolConfigMenu(capability.id);
            },
          } satisfies InkMenuItem]
          : []),
        ...(capability.type === 'middleware'
          ? [{
            label: 'Configure middleware',
            run: async () => {
              openMiddlewareConfigMenu(capability.id);
            },
          } satisfies InkMenuItem]
          : []),
        {
          label: 'Show details',
          run: async () => {
            appendLine(formatCapabilityStateRow(runtime.listCapabilities(capability.type).find((entry) => entry.id === capability.id) || capability), 'muted');
            if (capability.description) {
              appendLine(`  ${capability.description}`, 'muted');
            }
            if (capability.packageName) {
              appendLine(`  package: ${capability.packageName}${capability.packageVersion ? `@${capability.packageVersion}` : ''}`, 'muted');
            }
            if (capability.type === 'tool') {
              appendMultiline(runtime.describeToolConfig(capability.id), 'muted');
            }
            if (capability.type === 'middleware') {
              try {
                appendMultiline(runtime.describeMiddlewareConfig(capability.id), 'muted');
              } catch {
                // middleware without metadata can still be displayed
              }
            }
          },
        },
        {
          label: 'Back',
          run: async () => {},
        },
      ];
      openMenu(`${category} · ${capability.id}`, items);
    };

    const openCapabilityInstallScopeMenu = (type: CapabilityInstallType, packageName: string): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      openMenu(`Install ${packageName}`, [
        {
          label: 'Install (project)',
          run: async () => {
            const result = await runtime.installCapability(type, packageName, 'project');
            appendLine(`Installed ${result.packageName} as ${result.capabilityId} (project).`, 'success');
            appendLine(`Install directory: ${result.installDir}`, 'muted');
          },
        },
        {
          label: 'Install (global)',
          run: async () => {
            const result = await runtime.installCapability(type, packageName, 'global');
            appendLine(`Installed ${result.packageName} as ${result.capabilityId} (global).`, 'success');
            appendLine(`Install directory: ${result.installDir}`, 'muted');
          },
        },
        { label: 'Back', run: async () => {} },
      ]);
    };

    const openCapabilityInstallMenu = async (category: Extract<CapabilityCategory, 'tools' | 'middleware'>): Promise<void> => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }

      const type: CapabilityInstallType = category === 'tools' ? 'tool' : 'middleware';
      const officialCategory: OfficialCapabilityCategory = category === 'tools' ? 'tools' : 'middleware';
      const officialPackages = (await runtime.listOfficialCapabilityPackages(officialCategory))
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name));
      const diagnostics = runtime.getDiscoveryDiagnostics();
      if (diagnostics.length > 0) {
        appendLine(`Discovery note: ${diagnostics[0]}`, 'warning');
      }
      if (officialPackages.length === 0) {
        appendLine('Official catalog unavailable or empty. You can still install by custom package name.', 'muted');
      }

      const items: InkMenuItem[] = officialPackages.length > 0
        ? officialPackages.map((pkg) => ({
          label: `${pkg.name}@${pkg.version}${pkg.description ? ` — ${pkg.description}` : ''}`,
          run: async () => {
            openCapabilityInstallScopeMenu(type, pkg.name);
          },
        }))
        : [{
          label: 'No official packages found',
          run: async () => {
            appendLine(`No official ${officialCategory} packages found right now.`, 'muted');
          },
        }];

      items.push({
        label: 'RAG recommended bundle',
        run: async () => {
          openMenu('Install rag-recommended', [
            {
              label: 'Install (project)',
              run: async () => {
                const result = await runtime.installRecipe('rag-recommended', 'project');
                if (result.status !== 'completed') {
                  appendLine(`Recipe failed: ${result.failedStep || result.error || result.status}`, 'error');
                  return;
                }
                appendLine('Installed RAG recommended stack (project).', 'success');
              },
            },
            {
              label: 'Install (global)',
              run: async () => {
                const result = await runtime.installRecipe('rag-recommended', 'global');
                if (result.status !== 'completed') {
                  appendLine(`Recipe failed: ${result.failedStep || result.error || result.status}`, 'error');
                  return;
                }
                appendLine('Installed RAG recommended stack (global).', 'success');
              },
            },
            { label: 'Back', run: async () => {} },
          ]);
        },
      });

      items.push({
        label: 'RAG advanced bundle…',
        run: async () => {
          const backend = await promptInlineInput(
            'Backend for rag-advanced (vectra|chroma|custom):',
            'RAG advanced install cancelled.',
            'vectra',
          );
          if (!backend) {
            return;
          }
          const normalized = backend.trim().toLowerCase();
          let customPackage: string | undefined;
          if (normalized === 'custom') {
            customPackage = await promptInlineInput(
              'Custom vector package (e.g. @sisu-ai/vector-vectra):',
              'RAG advanced install cancelled.',
            );
            if (!customPackage) {
              return;
            }
          } else if (normalized !== 'vectra' && normalized !== 'chroma') {
            appendLine('Invalid backend. Use vectra, chroma, or custom.', 'warning');
            return;
          }
          openMenu('Install rag-advanced', [
            {
              label: 'Install (project)',
              run: async () => {
                const result = await runtime.installRecipe('rag-advanced', 'project', {
                  resolveChoice: async () => ({
                    optionId: normalized,
                    customPackageName: customPackage,
                  }),
                });
                if (result.status !== 'completed') {
                  appendLine(`Recipe failed: ${result.failedStep || result.error || result.status}`, 'error');
                  return;
                }
                appendLine(`Installed RAG advanced stack with ${normalized} backend (project).`, 'success');
              },
            },
            {
              label: 'Install (global)',
              run: async () => {
                const result = await runtime.installRecipe('rag-advanced', 'global', {
                  resolveChoice: async () => ({
                    optionId: normalized,
                    customPackageName: customPackage,
                  }),
                });
                if (result.status !== 'completed') {
                  appendLine(`Recipe failed: ${result.failedStep || result.error || result.status}`, 'error');
                  return;
                }
                appendLine(`Installed RAG advanced stack with ${normalized} backend (global).`, 'success');
              },
            },
            { label: 'Back', run: async () => {} },
          ]);
        },
      });

      items.push({
        label: 'Custom package name…',
        run: async () => {
          const packageName = await promptInlineInput(
            `Package name for ${type} (e.g. ${type === 'tool' ? 'azure-blob' : 'trace'} or @sisu-ai/${type === 'tool' ? 'tool' : 'mw'}-...):`,
            `${type} install cancelled.`,
          );
          if (!packageName) {
            return;
          }
          openCapabilityInstallScopeMenu(type, packageName);
        },
      });
      items.push({ label: 'Back', run: async () => {} });

      openMenu(`Install ${type} package`, items);
    };

    const runRecipeWithScopeMenu = (
      recipeId: 'rag-recommended' | 'rag-advanced',
      options?: { optionId?: string; customPackageName?: string },
    ): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      openMenu(`Install ${recipeId}`, [
        {
          label: 'Install (project)',
          run: async () => {
            const result = await runtime.installRecipe(recipeId, 'project', {
              resolveChoice: async () => ({
                optionId: options?.optionId || 'vectra',
                customPackageName: options?.customPackageName,
              }),
            });
            if (result.status !== 'completed') {
              appendLine(`Recipe failed: ${result.failedStep || result.error || result.status}`, 'error');
              if (result.completedSteps.length > 0) {
                appendLine(`Completed steps: ${result.completedSteps.length}`, 'muted');
              }
              return;
            }
            appendLine(`Installed recipe ${recipeId} (project).`, 'success');
          },
        },
        {
          label: 'Install (global)',
          run: async () => {
            const result = await runtime.installRecipe(recipeId, 'global', {
              resolveChoice: async () => ({
                optionId: options?.optionId || 'vectra',
                customPackageName: options?.customPackageName,
              }),
            });
            if (result.status !== 'completed') {
              appendLine(`Recipe failed: ${result.failedStep || result.error || result.status}`, 'error');
              if (result.completedSteps.length > 0) {
                appendLine(`Completed steps: ${result.completedSteps.length}`, 'muted');
              }
              return;
            }
            appendLine(`Installed recipe ${recipeId} (global).`, 'success');
          },
        },
        { label: 'Back', run: async () => {} },
      ]);
    };

    const openCapabilitySetupMenu = (category: CapabilityCategory): void => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return;
      }
      const capabilities = runtime.listCapabilities(capabilityTypeFromCategory(category));
      if (capabilities.length === 0) {
        appendLine(`No ${category} capabilities found.`, 'muted');
        return;
      }
      const items: InkMenuItem[] = [
        ...((category === 'tools' || category === 'middleware')
          ? [{
            label: `Install ${category === 'tools' ? 'tool' : 'middleware'} package`,
            run: async () => {
              await openCapabilityInstallMenu(category);
            },
          } satisfies InkMenuItem]
          : []),
        ...(category === 'middleware'
          ? [
            {
              label: 'Install recipe: RAG recommended',
              run: async () => {
                runRecipeWithScopeMenu('rag-recommended');
              },
            },
            {
              label: 'Install recipe: RAG advanced',
              run: async () => {
                const backend = await promptInlineInput(
                  'Backend for rag-advanced (vectra|chroma|custom):',
                  'RAG advanced install cancelled.',
                  'vectra',
                );
                if (!backend) {
                  return;
                }
                const normalized = backend.trim().toLowerCase();
                let customPackageName: string | undefined;
                if (normalized === 'custom') {
                  customPackageName = await promptInlineInput(
                    'Custom vector package (e.g. @sisu-ai/vector-vectra):',
                    'RAG advanced install cancelled.',
                  );
                  if (!customPackageName) {
                    return;
                  }
                } else if (normalized !== 'vectra' && normalized !== 'chroma') {
                  appendLine('Invalid backend. Use vectra, chroma, or custom.', 'warning');
                  return;
                }
                runRecipeWithScopeMenu('rag-advanced', {
                  optionId: normalized,
                  customPackageName,
                });
              },
            },
          ]
          : []),
        ...capabilities.map((capability) => ({
          label: capabilityDisplayLabel(capability),
          run: async () => {
            openCapabilityActionMenu(category, capability);
          },
        })),
      ];
      openMenu(`Configure ${category}`, items);
    };

    const openSettingsMenu = async (): Promise<void> => {
      openMenu('Settings', [
        { label: 'Switch provider', run: openProviderMenu },
        { label: 'Switch model', run: openModelMenu },
        {
          label: 'Set system prompt',
          run: async () => {
            const runtime = runtimeRef.current;
            if (!runtime) return;
            const value = await promptInlineInput(
              'System prompt text (or "clear" to remove):',
              'System prompt update cancelled.',
              runtime.profile.systemPrompt || '',
            );
            if (value === undefined) {
              return;
            }
            const normalized = parseSessionSystemPromptInput(value);
            openMenu('Apply system prompt', [
              {
                label: 'Apply (session)',
                run: async () => {
                  const result = await runtime.setSystemPrompt(normalized, 'session');
                  appendLine('Updated system prompt (session).', 'success');
                  if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                },
              },
              {
                label: 'Apply (project)',
                run: async () => {
                  const result = await runtime.setSystemPrompt(normalized, 'project');
                  appendLine('Updated system prompt (project).', 'success');
                  if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                },
              },
              {
                label: 'Apply (global)',
                run: async () => {
                  const result = await runtime.setSystemPrompt(normalized, 'global');
                  appendLine('Updated system prompt (global).', 'success');
                  if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                },
              },
              { label: 'Back', run: async () => {} },
            ]);
          },
        },
        { label: 'Sessions (resume/delete)', run: openSessionListMenu },
        { label: 'Capabilities: tools', run: async () => { openCapabilitySetupMenu('tools'); } },
        { label: 'Capabilities: skills', run: async () => { openCapabilitySetupMenu('skills'); } },
        { label: 'Capabilities: middleware', run: async () => { openCapabilitySetupMenu('middleware'); } },
        { label: 'Open project config in editor', run: async () => { await handleCommand('/open-config project'); } },
        { label: 'Open global config in editor', run: async () => { await handleCommand('/open-config global'); } },
      ]);
    };

    const openOptionsMenu = async (): Promise<void> => {
      openMenu('Options', [
        { label: 'New session', run: async () => { const runtime = runtimeRef.current; if (runtime) { const id = await runtime.startNewSession(); appendLine(`Started new session ${id}.`, 'success'); } } },
        { label: 'Settings…', run: openSettingsMenu },
        { label: 'Sessions (resume/delete)', run: openSessionListMenu },
        { label: 'Branch from message', run: openBranchMenu },
        { label: 'Cancel active run', run: async () => { const runtime = runtimeRef.current; if (runtime) { const cancelled = runtime.cancelActiveRun(); appendLine(cancelled ? 'Cancellation requested.' : 'No active run to cancel.', cancelled ? 'warning' : 'muted'); } } },
        { label: 'Help', run: async () => { appendLine('Commands: /help, /new, /provider [id], /model [name], /system-prompt [scope] [text], /tool-rounds [scope] [value], /tools, /skills, /middleware, /tools setup, /skills setup, /middleware setup, /enable <id> [scope], /disable <id> [scope], /tool-config <tool-id> <json> [scope], /tool-config-options <tool-id>, /middleware-config <middleware-id> <json> [scope], /middleware-config-options <middleware-id>, /official <category>, /install <tool|middleware> <name> [project|global], /install recipe <id> [project|global] [option], /allow-command <prefix> [scope], /open-config [project|global], /cancel, /sessions, /resume [sessionId], /delete-session <sessionId>, /search <query>, /branch [messageId], /exit', 'muted'); } },
        { label: 'Exit', run: async () => { exit(); } },
      ]);
    };

    useEffect(() => {
      if (!busy || externalTaskActive) {
        return () => {};
      }
      const timer = setInterval(() => {
        setSpinnerFrame((value: number) => (value + 1) % spinnerFrames.length);
      }, 90);
      return () => clearInterval(timer);
    }, [busy, externalTaskActive]);

    useEffect(() => {
      if (!ready || busy || externalTaskActive) {
        setCursorVisible(true);
        return () => {};
      }
      const timer = setInterval(() => {
        setCursorVisible((value: boolean) => !value);
      }, 500);
      return () => clearInterval(timer);
    }, [ready, busy, externalTaskActive]);

    useEffect(() => {
      let disposed = false;
      let teardown = () => {};
      const init = async () => {
        try {
          const runtime = await ChatRuntime.create({
            sessionId: parsed.sessionId,
            confirmToolExecution: async () => false,
          });
          if (disposed) {
            return;
          }
          runtimeRef.current = runtime;
          teardown = runtime.onEvent((event) => {
            setAgentStatus((current) => nextInkAgentStatus(current, event));
            const lines = toInkEventLines(event);
            if (lines.length === 0) {
              return;
            }
            appendLines(lines);
          });
          setReady(true);
          appendLine('Ready. Type /help or press Ctrl+O for options.', 'muted');
          const startupError = runtime.getProviderStartupError();
          if (startupError) {
            setProviderHealth('error');
            setProviderHealthText(startupError);
            appendLine(`Provider startup error: ${startupError}`, 'warning');
            appendLine('Use /provider or /model to recover.', 'muted');
          } else {
            probeProviderInBackground(runtime);
          }
        } catch (error) {
          appendLine(`Startup error: ${formatError(error)}`, 'error');
          setProviderHealth('error');
          setProviderHealthText(formatError(error));
        } finally {
          if (!disposed) {
            setReady(true);
          }
        }
      };

      void init();
      return () => {
        disposed = true;
        teardown();
      };
    }, []);

    const handleCommand = async (line: string): Promise<boolean> => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        return true;
      }

      if (line === '/help') {
        appendLine('Commands: /help, /new, /provider [id], /model [name], /system-prompt [scope] [text], /tool-rounds [scope] [value], /tools, /skills, /middleware, /tools setup, /skills setup, /middleware setup, /enable <id> [scope], /disable <id> [scope], /tool-config <tool-id> <json> [scope], /tool-config-options <tool-id>, /middleware-config <middleware-id> <json> [scope], /middleware-config-options <middleware-id>, /official <category>, /install <tool|middleware> <name> [project|global], /install recipe <id> [project|global] [option], /allow-command <prefix> [scope], /open-config [project|global], /cancel, /sessions, /resume [sessionId], /delete-session <sessionId>, /search <query>, /branch [messageId], /exit', 'muted');
        appendLine('Shortcuts: Ctrl+O (options), Shift+S (settings), Shift+Enter newline (Ctrl+J fallback), Esc (close menu).', 'muted');
        return true;
      }
      if (line === '/exit' || line === '/quit') {
        return false;
      }
      if (line === '/options') {
        await openOptionsMenu();
        return true;
      }
      if (line === '/settings') {
        await openSettingsMenu();
        return true;
      }
      if (line === '/new') {
        const sessionId = await runtime.startNewSession();
        appendLine(`Started new session ${sessionId}.`, 'success');
        return true;
      }
      if (line === '/cancel') {
        const cancelled = runtime.cancelActiveRun();
        appendLine(cancelled ? 'Cancellation requested.' : 'No active run to cancel.', cancelled ? 'warning' : 'muted');
        return true;
      }
      if (line === '/sessions') {
        await openSessionListMenu();
        return true;
      }
      if (line.startsWith('/search ')) {
        const query = line.slice('/search '.length).trim();
        const results = await runtime.searchSessions(query);
        results.forEach((result: SessionStoreSearchResult) => {
          appendLine(`- ${result.sessionId} | ${result.updatedAt} | ${result.preview}`, 'muted');
        });
        return true;
      }
      if (line.startsWith('/resume ')) {
        const sessionId = line.slice('/resume '.length).trim();
        await runtime.resumeSession(sessionId);
        appendLine(`Resumed session ${sessionId}.`, 'success');
        appendLine('Loaded session history:', 'muted');
        appendLines(toInkHistoryLines(runtime.getState().messages));
        return true;
      }
      if (line.startsWith('/delete-session ')) {
        const sessionId = line.slice('/delete-session '.length).trim();
        const deleted = await runtime.deleteSession(sessionId);
        appendLine(
          deleted
            ? `Deleted session ${sessionId}.`
            : `Session not found: ${sessionId}.`,
          deleted ? 'warning' : 'muted',
        );
        return true;
      }
      if (line === '/resume') {
        await openSessionListMenu();
        return true;
      }
      if (line.startsWith('/branch ')) {
        const messageId = line.slice('/branch '.length).trim();
        const nextSession = await runtime.branchFromMessage(messageId);
        appendLine(`Created branch session ${nextSession}.`, 'success');
        return true;
      }
      if (line === '/branch') {
        await openBranchMenu();
        return true;
      }
      if (line === '/provider') {
        await openProviderMenu();
        return true;
      }
      if (line === '/system-prompt') {
        const current = runtime.profile.systemPrompt?.trim() || '<none>';
        appendLine(`Current system prompt: ${current}`, 'muted');
        return true;
      }
      if (line.startsWith('/system-prompt ')) {
        const payload = line.slice('/system-prompt '.length).trim();
        const [scopeToken, ...rest] = payload.split(/\s+/);
        let scope: CapabilityScopeTarget = 'session';
        let promptText = payload;
        const maybeScope = parseScopeTarget(scopeToken);
        if (maybeScope) {
          scope = maybeScope;
          promptText = rest.join(' ');
        }
        const normalized = parseSessionSystemPromptInput(promptText);
        const result = await runtime.setSystemPrompt(normalized, scope);
        appendLine(`Updated system prompt (${scope}).`, 'success');
        if (result.targetPath) {
          appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
        }
        return true;
      }
      if (line === '/tools' || line === '/skills' || line === '/middleware') {
        const category = line.slice(1) as CapabilityCategory;
        const mapped = capabilityTypeFromCategory(category);
        appendLine(`${category.toUpperCase()}:`, 'muted');
        const capabilities = runtime.listCapabilities(mapped);
        if (capabilities.length === 0) {
          appendLine('  (none)', 'muted');
          return true;
        }
        for (const capability of capabilities) {
          appendLine(`- ${formatCapabilityStateRow(capability)}`, 'muted');
        }
        if (category === 'middleware') {
          appendLine(runtime.getMiddlewareStartupSummary(), 'muted');
        }
        return true;
      }
      if (line === '/tools setup' || line === '/skills setup') {
        const category = line.slice(1, -' setup'.length) as CapabilityCategory;
        openCapabilitySetupMenu(category);
        return true;
      }
      if (line === '/middleware setup') {
        openMenu('Middleware setup', [
          {
            label: 'Configure pipeline (terminal mode)',
            run: async () => {
              appendLine('Use terminal mode for guided middleware pipeline setup.', 'muted');
            },
          },
          {
            label: `Set maxRounds (current: ${runtime.getToolCallingMaxRounds()})`,
            run: async () => {
              const value = await promptInlineInput(
                'maxRounds value (8, 16, 24, 32, or custom positive integer):',
                'maxRounds update cancelled.',
                String(runtime.getToolCallingMaxRounds()),
              );
              if (!value) {
                return;
              }
              const parsed = Number.parseInt(value.trim(), 10);
              if (!Number.isInteger(parsed) || parsed <= 0) {
                appendLine('Invalid maxRounds value.', 'warning');
                return;
              }
              openMenu('Apply maxRounds', [
                {
                  label: 'Apply (session)',
                  run: async () => {
                    const result = await runtime.setMiddlewareConfig('tool-calling', { maxRounds: parsed }, 'session');
                    appendLine(`Updated tool-calling.maxRounds to ${parsed} (session).`, 'success');
                    if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                  },
                },
                {
                  label: 'Apply (project)',
                  run: async () => {
                    const result = await runtime.setMiddlewareConfig('tool-calling', { maxRounds: parsed }, 'project');
                    appendLine(`Updated tool-calling.maxRounds to ${parsed} (project).`, 'success');
                    if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                  },
                },
                {
                  label: 'Apply (global)',
                  run: async () => {
                    const result = await runtime.setMiddlewareConfig('tool-calling', { maxRounds: parsed }, 'global');
                    appendLine(`Updated tool-calling.maxRounds to ${parsed} (global).`, 'success');
                    if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                  },
                },
                { label: 'Back', run: async () => {} },
              ]);
            },
          },
          {
            label: 'Set system prompt',
            run: async () => {
              const value = await promptInlineInput(
                'System prompt text (or "clear" to remove):',
                'System prompt update cancelled.',
                runtime.profile.systemPrompt || '',
              );
              if (value === undefined) {
                return;
              }
              const normalized = parseSessionSystemPromptInput(value);
              openMenu('Apply system prompt', [
                {
                  label: 'Apply (session)',
                  run: async () => {
                    const result = await runtime.setSystemPrompt(normalized, 'session');
                    appendLine('Updated system prompt (session).', 'success');
                    if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                  },
                },
                {
                  label: 'Apply (project)',
                  run: async () => {
                    const result = await runtime.setSystemPrompt(normalized, 'project');
                    appendLine('Updated system prompt (project).', 'success');
                    if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                  },
                },
                {
                  label: 'Apply (global)',
                  run: async () => {
                    const result = await runtime.setSystemPrompt(normalized, 'global');
                    appendLine('Updated system prompt (global).', 'success');
                    if (result.targetPath) appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
                  },
                },
                { label: 'Back', run: async () => {} },
              ]);
            },
          },
          { label: 'Back', run: async () => {} },
        ]);
        return true;
      }
      if (line.startsWith('/official ')) {
        const category = line.slice('/official '.length).trim();
        if (category !== 'middleware' && category !== 'tools' && category !== 'skills') {
          appendLine('Usage: /official <middleware|tools|skills>', 'warning');
          return true;
        }
        const packages = await runtime.listOfficialCapabilityPackages(category);
        const diagnostics = runtime.getDiscoveryDiagnostics();
        if (diagnostics.length > 0) {
          appendLine(`Discovery note: ${diagnostics[0]}`, 'warning');
        }
        if (packages.length === 0) {
          appendLine(`No official ${category} packages found.`, 'muted');
          return true;
        }
        for (const pkg of packages) {
          appendLine(`- ${pkg.name}@${pkg.version} ${pkg.description}`, 'muted');
        }
        return true;
      }
      if (line.startsWith('/install ')) {
        const payload = line.slice('/install '.length).trim();
        const [typeRaw, nameRaw, scopeRaw, extraRaw] = payload.split(/\s+/, 4);
        if (typeRaw === 'recipe') {
          if (!nameRaw) {
            appendLine('Usage: /install recipe <rag-recommended|rag-advanced> [project|global] [vectra|chroma|custom[:package]]', 'warning');
            return true;
          }
          const scope: CapabilityInstallScope = scopeRaw === 'global' ? 'global' : 'project';
          let optionId = 'vectra';
          let customPackageName: string | undefined;
          if (extraRaw) {
            if (extraRaw.startsWith('custom:')) {
              optionId = 'custom';
              customPackageName = extraRaw.slice('custom:'.length).trim();
            } else {
              optionId = extraRaw;
            }
          }
          const result = await runtime.installRecipe(nameRaw, scope, {
            resolveChoice: async () => ({ optionId, customPackageName }),
          });
          if (result.status === 'cancelled') {
            appendLine(`Recipe ${nameRaw} cancelled.`, 'warning');
            return true;
          }
          if (result.status === 'failed') {
            appendLine(`Recipe ${nameRaw} failed at ${result.failedStep || 'unknown step'}: ${result.error || 'unknown error'}`, 'error');
            if (result.completedSteps.length > 0) {
              appendLine(`Completed steps: ${result.completedSteps.length}`, 'muted');
            }
            return true;
          }
          appendLine(`Installed recipe ${nameRaw} (${scope}).`, 'success');
          return true;
        }
        if (!nameRaw || (typeRaw !== 'tool' && typeRaw !== 'middleware')) {
          appendLine('Usage: /install <tool|middleware> <name> [project|global] OR /install recipe <id> [project|global] [option]', 'warning');
          return true;
        }
        const scope: CapabilityInstallScope = scopeRaw === 'global' ? 'global' : 'project';
        const installed = await runtime.installCapability(typeRaw, nameRaw, scope);
        appendLine(`Installed ${installed.packageName} as ${installed.capabilityId} (${scope}).`, 'success');
        appendLine(`Install directory: ${installed.installDir}`, 'muted');
        return true;
      }
      if (line.startsWith('/enable ') || line.startsWith('/disable ')) {
        const enable = line.startsWith('/enable ');
        const payload = line.slice(enable ? '/enable '.length : '/disable '.length).trim();
        const [capabilityId, scopeRaw] = payload.split(/\s+/, 2);
        const scope = parseScopeTarget(scopeRaw) || 'session';
        if (!capabilityId) {
          appendLine(`Usage: ${enable ? '/enable' : '/disable'} <capability-id> [session|project|global]`, 'warning');
          return true;
        }
        const result = await runtime.setCapabilityEnabled(capabilityId, enable, scope);
        appendLine(`${enable ? 'Enabled' : 'Disabled'} ${capabilityId} (${scope}).`, 'success');
        if (result.targetPath) {
          appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
        }
        return true;
      }
      if (line.startsWith('/allow-command ')) {
        const payload = line.slice('/allow-command '.length).trim();
        const [prefix, scopeRaw] = payload.split(/\s+/, 2);
        const scope = parseScopeTarget(scopeRaw) || 'session';
        if (!prefix) {
          appendLine('Usage: /allow-command <prefix> [session|project|global]', 'warning');
          return true;
        }
        const result = await runtime.addAllowCommandPrefix(prefix, scope);
        appendLine(`Added allow prefix '${prefix}' (${scope}).`, 'success');
        if (result.targetPath) {
          appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
        }
        return true;
      }
      if (line.startsWith('/tool-config ')) {
        const payload = line.slice('/tool-config '.length);
        let command: ReturnType<typeof parseToolConfigCommandPayload>;
        try {
          command = parseToolConfigCommandPayload(payload);
        } catch (error) {
          appendLine(error instanceof Error ? error.message : String(error), 'warning');
          return true;
        }
        const result = await runtime.setToolConfig(command.toolId, command.config, command.scope);
        appendLine(`Updated ${command.toolId} config (${command.scope}).`, 'success');
        if (result.targetPath) {
          appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
        }
        return true;
      }
      if (line.startsWith('/tool-config-options ')) {
        const toolId = line.slice('/tool-config-options '.length).trim();
        if (!toolId) {
          appendLine('Usage: /tool-config-options <tool-id>', 'warning');
          return true;
        }
        appendMultiline(runtime.describeToolConfig(toolId), 'muted');
        return true;
      }
      if (line.startsWith('/middleware-config ')) {
        const payload = line.slice('/middleware-config '.length);
        let command: ReturnType<typeof parseMiddlewareConfigCommandPayload>;
        try {
          command = parseMiddlewareConfigCommandPayload(payload);
        } catch (error) {
          appendLine(error instanceof Error ? error.message : String(error), 'warning');
          return true;
        }
        const result = await runtime.setMiddlewareConfig(command.middlewareId, command.config, command.scope);
        appendLine(`Updated ${command.middlewareId} config (${command.scope}).`, 'success');
        if (result.targetPath) {
          appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
        }
        return true;
      }
      if (line.startsWith('/middleware-config-options ')) {
        const middlewareId = line.slice('/middleware-config-options '.length).trim();
        if (!middlewareId) {
          appendLine('Usage: /middleware-config-options <middleware-id>', 'warning');
          return true;
        }
        appendMultiline(runtime.describeMiddlewareConfig(middlewareId), 'muted');
        return true;
      }
      if (line === '/tool-rounds') {
        appendLine(`Current maxRounds: ${runtime.getToolCallingMaxRounds()}`, 'muted');
        return true;
      }
      if (line.startsWith('/tool-rounds ')) {
        const payload = line.slice('/tool-rounds '.length).trim();
        const [scopeToken, valueToken] = payload.split(/\s+/, 2);
        let scope: CapabilityScopeTarget = 'session';
        let valueRaw = payload;
        const maybeScope = parseScopeTarget(scopeToken);
        if (maybeScope) {
          scope = maybeScope;
          valueRaw = valueToken || '';
        }
        const parsed = Number.parseInt(valueRaw, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          appendLine('Usage: /tool-rounds [session|project|global] <positive-integer>', 'warning');
          return true;
        }
        const result = await runtime.setMiddlewareConfig('tool-calling', { maxRounds: parsed }, scope);
        appendLine(`Updated tool-calling.maxRounds to ${parsed} (${scope}).`, 'success');
        if (result.targetPath) {
          appendLine(`Wrote profile: ${result.targetPath}`, 'muted');
        }
        return true;
      }
      if (line === '/open-config' || line.startsWith('/open-config ')) {
        const rawScope = line.slice('/open-config'.length).trim();
        const scope = (rawScope === 'global' || rawScope === 'project') ? rawScope : 'project';
        const editor = configuredEditorCommand();
        const targetPath = runtime.getConfigPath(scope);
        if (!editor) {
          appendLine('E6510: Set $EDITOR or $VISUAL to open config in editor.', 'warning');
          return true;
        }
        if (isTerminalEditorCommand(editor)) {
          appendLine('Terminal editor detected. To avoid TUI conflicts, run this in your shell:', 'warning');
          appendLine(`${editor} ${targetPath}`, 'muted');
          return true;
        }
        setExternalTaskActive(true);
        try {
          const opened = await runtime.openConfigInEditor(scope);
          appendLine(`Opened config: ${opened}`, 'success');
        } finally {
          setExternalTaskActive(false);
        }
        return true;
      }
      if (line.startsWith('/provider ')) {
        const provider = asProviderChoice(line.slice('/provider '.length).trim());
        if (!provider) {
          appendLine('Invalid provider. Use ollama, openai, anthropic, or mock.', 'error');
          return true;
        }
        const next = await runtime.setProvider(provider);
        appendLine(`Provider updated: ${next.provider} / ${next.model}`, 'success');
        return true;
      }
      if (line === '/model') {
        await openModelMenu();
        return true;
      }
      if (line.startsWith('/model ')) {
        const model = line.slice('/model '.length).trim();
        const next = await runtime.setModel(model);
        appendLine(`Model updated: ${next.provider} / ${next.model}`, 'success');
        return true;
      }

      appendLine(`Unknown command: ${line}`, 'warning');
      return true;
    };

    const submit = async (): Promise<void> => {
      const runtime = runtimeRef.current;
      const trimmed = inputValue.trim();
      setInputValue('');
      if (!trimmed) {
        return;
      }
      setAgentStatus({ text: 'Thinking…', tone: 'info' });
      if (!trimmed.startsWith('/')) {
        appendLine(`You: ${trimmed}`, 'info');
      }
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
        setAgentStatus(initialInkAgentStatus());
        return;
      }

      setBusy(true);
      try {
        if (trimmed.startsWith('/')) {
          const keepRunning = await handleCommand(trimmed);
          if (!keepRunning) {
            exit();
          }
        } else {
          await runtime.runPrompt(trimmed);
        }
      } catch (error) {
        appendLine(formatError(error), 'error');
        setAgentStatus({ text: 'Error', tone: 'error' });
      } finally {
        setAgentStatus((current) => (current.tone === 'error' ? current : initialInkAgentStatus()));
        setBusy(false);
      }
    };

    useInput((value, key) => {
      if (key.ctrl && value === 'c') {
        exit();
        return;
      }
      if (!ready) {
        return;
      }
      if (externalTaskActive) {
        return;
      }
      if (inlinePrompt) {
        if (key.escape) {
          const current = inlinePrompt;
          setInlinePrompt(undefined);
          setInputValue('');
          current.resolve(undefined);
          appendLine(current.cancelMessage, 'muted');
          return;
        }
        if (key.return) {
          const current = inlinePrompt;
          const submitted = inputValue.trim();
          setInlinePrompt(undefined);
          setInputValue('');
          if (!submitted) {
            current.resolve(undefined);
            appendLine(current.cancelMessage, 'muted');
            return;
          }
          current.resolve(submitted);
          return;
        }
        if (isInkEraseKey(value, key)) {
          setInputValue((previous: string) => previous.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && value.length > 0) {
          setInputValue((previous: string) => `${previous}${value}`);
        }
        return;
      }
      if (menuOpen) {
        if (key.escape) {
          closeMenu();
          return;
        }
        if (key.upArrow) {
          setMenuIndex((current) => (current <= 0 ? Math.max(menuItems.length - 1, 0) : current - 1));
          return;
        }
        if (key.downArrow) {
          setMenuIndex((current) => (current + 1) % Math.max(menuItems.length, 1));
          return;
        }
        if (key.return) {
          const selected = menuItems[menuIndex];
          if (!selected) {
            closeMenu();
            return;
          }
          closeMenu();
          setBusy(true);
          void (async () => {
            try {
              await selected.run();
            } catch (error) {
              appendLine(formatError(error), 'error');
            } finally {
              setBusy(false);
            }
          })();
          return;
        }
      }

      if ((key.ctrl && value.toLowerCase() === 'o') || (key.shift && value === 'S' && inputValue.length === 0)) {
        void ((async () => {
          if (key.ctrl) {
            await openOptionsMenu();
          } else {
            await openSettingsMenu();
          }
        })());
        return;
      }

      if (!busy && isInkNewlineKey(value, key)) {
        setInputValue((previous: string) => `${previous}\n`);
        return;
      }

      if (key.return) {
        void submit();
        return;
      }
      if (isInkEraseKey(value, key)) {
        setInputValue((previous: string) => previous.slice(0, -1));
        return;
      }
      if (busy) {
        return;
      }
      if (!key.ctrl && !key.meta && value.length > 0) {
        setInputValue((previous: string) => `${previous}${value}`);
      }
    });

    const runtime = runtimeRef.current;
    const profileText = runtime ? `${runtime.profile.provider}/${runtime.profile.model}` : 'loading/provider';
    const sessionText = runtime?.getState().sessionId || parsed.sessionId || 'session-pending';
    const promptPrefix = busy ? `${spinnerFrames[spinnerFrame]} > ` : '> ';
    const cursorGlyph = cursorVisible ? '▋' : ' ';
    const renderedInput = renderInputText(promptPrefix, inputValue, cursorGlyph);
    const providerHealthColor = providerHealth === 'error' ? 'red' : providerHealth === 'ready' ? 'green' : 'yellow';
    const statusIndicator = agentStatus.tone === 'muted'
      ? '○'
      : statusPulseFrames[spinnerFrame % statusPulseFrames.length];

    return createElement(
      Box,
      { flexDirection: 'column' },
      createElement(
        Box,
        { flexDirection: 'column', marginTop: 1, flexGrow: 1 },
        transcript.length > 0
          ? createElement(Static, {
            items: transcript,
            children: (line: unknown) => {
              const item = line as InkTranscriptLine & { id: string };
              return createElement(Text, { key: item.id, ...inkToneToColor(item.tone) }, item.text);
            },
          })
          : createElement(Text, { dimColor: true }, 'Start chatting...'),
      ),
      menuOpen
        ? createElement(
          Box,
          { marginTop: 1, borderStyle: 'round', borderColor: 'magenta', paddingX: 1, flexDirection: 'column' },
          createElement(Text, { color: 'magenta' }, `${menuTitle} · ↑/↓ navigate · Enter select · Esc close`),
          ...menuItems.map((item, index) => createElement(
            Text,
            { key: `${item.label}-${index}`, color: index === menuIndex ? 'cyan' : undefined },
            `${index === menuIndex ? '›' : ' '} ${item.label}`,
          )),
        )
        : undefined,
      inlinePrompt
        ? createElement(
          Box,
          { marginTop: 1, borderStyle: 'round', borderColor: 'cyan', paddingX: 1, flexDirection: 'column' },
          createElement(Text, { color: 'cyan' }, inlinePrompt.prompt),
          createElement(Text, { dimColor: true }, 'Enter submit · Esc cancel'),
        )
        : undefined,
      externalTaskActive
        ? createElement(
          Box,
          { marginTop: 1, borderStyle: 'round', borderColor: 'yellow', paddingX: 1 },
          createElement(Text, { color: 'yellow' }, 'Opening editor...'),
        )
        : undefined,
      createElement(
        Text,
        {
          dimColor: agentStatus.tone === 'muted',
          color: agentStatus.tone === 'error'
            ? 'red'
            : agentStatus.tone === 'warning'
              ? 'yellow'
              : agentStatus.tone === 'success'
                ? 'green'
                : agentStatus.tone === 'info'
                  ? 'cyan'
                  : undefined,
        },
        `${statusIndicator} ${agentStatus.text}`,
      ),
      createElement(
        Box,
        { marginTop: 1, borderStyle: 'round', borderColor: busy ? 'yellow' : 'cyan', paddingX: 1 },
        createElement(Text, { color: busy ? 'yellow' : 'green' }, renderedInput),
      ),
      createElement(Text, { dimColor: true, color: 'cyan' }, `[${profileText}]  ${sessionText}`),
      createElement(Text, { color: providerHealthColor }, providerHealthText),
      createElement(Text, { dimColor: true }, 'Enter send · Shift+Enter newline (Ctrl+J fallback) · Backspace edit · Ctrl+O options · Shift+S settings · /help · Ctrl+C exit'),
    );
  };

  const app = render(createElement(App), {
    stdin: io.input as typeof stdin,
    stdout: io.output as typeof stdout,
    exitOnCtrlC: true,
  });
  await app.waitUntilExit();
}

export async function runChatCli(argv: string[], io?: { input?: Readable; output?: Writable }): Promise<void> {
  const parsed = parseChatArgs(argv);
  const input = io?.input || stdin;
  const output = io?.output || stdout;
  const inputWithTty = input as Readable & { isTTY?: boolean };
  const outputWithTty = output as Writable & { isTTY?: boolean };
  const pipedPrompt = parsed.prompt || (io?.input ? undefined : await readPipedPrompt(input));

  if (!pipedPrompt && inputWithTty.isTTY && outputWithTty.isTTY) {
    await runInkChatCli(parsed, { input, output });
    return;
  }

  const pickerEnabled = Boolean(inputWithTty.isTTY) && Boolean(outputWithTty.isTTY);
  const spinnerEnabled = !io?.output && Boolean(stdout.isTTY) && !process.env.NO_COLOR;
  const renderer = new TerminalRenderer({ output });

  const withLoader = async <T>(text: string, task: () => Promise<T>): Promise<T> => {
    const spinner = spinnerEnabled ? ora({ text, discardStdin: false }).start() : undefined;
    try {
      const result = await task();
      spinner?.succeed(text);
      return result;
    } catch (error) {
      spinner?.fail(text);
      throw error;
    }
  };

  const runtime = await ChatRuntime.create({
    sessionId: parsed.sessionId,
    confirmToolExecution: async (request, reason) => {
      const ui = createPromisesInterface({ input, output });
      try {
        const answer = await ui.question(`Confirm tool action? ${reason}\n$ ${request.command}\n[y/N] `);
        const normalized = answer.trim().toLowerCase();
        return normalized === 'y' || normalized === 'yes';
      } finally {
        ui.close();
      }
    },
  });

  const teardown = runtime.onEvent((event) => {
    renderer.render(event);
  });

  if (runtime.profile.provider === 'mock') {
    output.write('Using mock provider. Set provider/model in ~/.sisu/chat-profile.json or ./.sisu/chat-profile.json for real LLM responses.\n');
  }
  output.write(`Active provider/model: ${runtime.profile.provider} / ${runtime.profile.model}\n`);
  output.write(`${runtime.getMiddlewareStartupSummary()}\n`);

  if (pipedPrompt) {
    try {
      await runtime.runPrompt(pipedPrompt);
    } finally {
      teardown();
    }
    return;
  }

  const createUi = (): ReadlineInterface => createPromisesInterface({
    input,
    output,
    terminal: true,
    historySize: 500,
  });
  let ui: ReadlineInterface = createUi();

  output.write('Sisu Chat started. Commands: /help, /new, /provider [id], /model [name], /system-prompt [scope] [text], /tool-rounds [scope] [value], /tools, /skills, /middleware, /tools setup, /skills setup, /middleware setup, /enable <id> [scope], /disable <id> [scope], /tool-config <tool-id> <json> [scope], /tool-config-options <tool-id>, /middleware-config <middleware-id> <json> [scope], /middleware-config-options <middleware-id>, /official <category>, /install <tool|middleware> <name> [project|global], /install recipe <id> [project|global] [option], /allow-command <prefix> [scope], /open-config [project|global], /cancel, /sessions, /resume <sessionId>, /delete-session <sessionId>, /search <query>, /branch <messageId>, /exit\n');
  output.write('Tip: /help for commands. Prompt shows active provider/model and session.\n');

  const renderPromptContext = (): void => {
    const state = runtime.getState();
    output.write(`[${runtime.profile.provider}/${runtime.profile.model}] [session ${state.sessionId}]\n`);
  };

  const promptChoice = async (title: string, values: string[], current?: string): Promise<string | undefined> => {
    if (values.length === 0) {
      return undefined;
    }

    if (pickerEnabled) {
      ui.close();
      let response: { value?: string } = {};
      try {
        response = await prompts({
          type: 'select',
          name: 'value',
          message: title,
          choices: values.map((value) => ({
            title: value === current ? `${value} (current)` : value,
            value,
          })),
          initial: Math.max(values.findIndex((value) => value === current), 0),
        }, {
          onCancel: () => true,
        });
      } finally {
        ui = createUi();
      }
      if (typeof response.value === 'string' && response.value.trim().length > 0) {
        return response.value;
      }
      return undefined;
    }

    output.write(`${title}\n`);
    values.forEach((value, index) => {
      const marker = value === current ? ' (current)' : '';
      output.write(`  ${index + 1}. ${value}${marker}\n`);
    });
    let answer: string;
    try {
      answer = (await ui.question('Select number/value (Enter to cancel): ')).trim();
    } catch (error) {
      if (!isReadlineClosedError(error)) {
        throw error;
      }
      ui = createUi();
      answer = (await ui.question('Select number/value (Enter to cancel): ')).trim();
    }
    if (!answer) {
      return undefined;
    }
    const numeric = Number.parseInt(answer, 10);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= values.length) {
      return values[numeric - 1];
    }
    return answer;
  };

  const promptConfigScope = async (includeSession = true): Promise<CapabilityScopeTarget | undefined> => {
    const values = includeSession ? ['session', 'project', 'global'] : ['project', 'global'];
    const picked = await promptChoice('Select scope:', values);
    return parseScopeTarget(picked);
  };

  const runCapabilitySetupMenu = async (category: CapabilityCategory): Promise<void> => {
    const mapped = capabilityTypeFromCategory(category);
    while (true) {
      const capabilities = runtime.listCapabilities(mapped);
      output.write(`${category.toUpperCase()}:\n`);
      if (capabilities.length === 0) {
        output.write('  (none)\n');
        return;
      }
      for (const capability of capabilities) {
        output.write(`- ${formatCapabilityStateRow(capability)}\n`);
      }
      if (category === 'middleware') {
        output.write(`${runtime.getMiddlewareStartupSummary()}\n`);
      }

      const selected = await promptChoice(
        `Select ${category} capability:`,
        [...capabilities.map((capability) => capability.id), 'Done'],
      );
      if (!selected || selected === 'Done') {
        return;
      }
      const target = capabilities.find((capability) => capability.id === selected);
      if (!target) {
        output.write('Invalid capability selection.\n');
        continue;
      }

      const action = await promptChoice(
        `Action for ${target.id}:`,
        [target.enabled ? 'Disable' : 'Enable', 'Show details', 'Back'],
      );
      if (!action || action === 'Back') {
        continue;
      }
      if (action === 'Show details') {
        output.write(`${formatCapabilityStateRow(target)}\n`);
        if (target.description) {
          output.write(`  ${target.description}\n`);
        }
        if (target.packageName) {
          output.write(`  package: ${target.packageName}${target.packageVersion ? `@${target.packageVersion}` : ''}\n`);
        }
        if (target.type === 'tool') {
          output.write(`${runtime.describeToolConfig(target.id)}\n`);
        }
        if (target.type === 'middleware') {
          try {
            output.write(`${runtime.describeMiddlewareConfig(target.id)}\n`);
          } catch {
            // middleware without metadata still supports pipeline editing
          }
        }
        continue;
      }

      if (category === 'tools') {
        const configureAction = await promptChoice(
          `Configure ${target.id}?`,
          ['Apply preset', 'Skip'],
        );
        if (configureAction === 'Apply preset') {
          const presets = runtime.getToolConfigPresets(target.id);
          if (presets.length === 0) {
            output.write(`No presets available for ${target.id}.\n`);
          } else {
            const chosenPresetLabel = await promptChoice(
              `Select preset for ${target.id}:`,
              presets.map((preset) => preset.label),
            );
            const chosenPreset = presets.find((preset) => preset.label === chosenPresetLabel);
            if (chosenPreset) {
              const presetScope = await promptConfigScope(true);
              if (presetScope) {
                const presetResult = await withLoader(
                  `Applying ${chosenPreset.label}`,
                  async () => await runtime.setToolConfig(target.id, chosenPreset.config, presetScope),
                );
                output.write(`Applied ${chosenPreset.label} preset to ${target.id} (${presetScope}).\n`);
                if (presetResult.targetPath) {
                  output.write(`Wrote profile: ${presetResult.targetPath}\n`);
                }
              }
            }
          }
        }
      }

      if (category === 'middleware') {
        const configureAction = await promptChoice(
          `Configure ${target.id}?`,
          ['Apply preset', 'Skip'],
        );
        if (configureAction === 'Apply preset') {
          const presets = runtime.getMiddlewareConfigPresets(target.id);
          if (presets.length === 0) {
            output.write(`No presets available for ${target.id}.\n`);
          } else {
            const chosenPresetLabel = await promptChoice(
              `Select preset for ${target.id}:`,
              presets.map((preset) => preset.label),
            );
            const chosenPreset = presets.find((preset) => preset.label === chosenPresetLabel);
            if (chosenPreset) {
              const presetScope = await promptConfigScope(true);
              if (presetScope) {
                const presetResult = await withLoader(
                  `Applying ${chosenPreset.label}`,
                  async () => await runtime.setMiddlewareConfig(target.id, chosenPreset.config, presetScope),
                );
                output.write(`Applied ${chosenPreset.label} preset to ${target.id} (${presetScope}).\n`);
                if (presetResult.targetPath) {
                  output.write(`Wrote profile: ${presetResult.targetPath}\n`);
                }
              }
            }
          }
        }
      }

      const scope = await promptConfigScope(true);
      if (!scope) {
        output.write('Scope selection cancelled.\n');
        continue;
      }
      const enable = action === 'Enable';
      const result = await withLoader(
        `${enable ? 'Enabling' : 'Disabling'} capability`,
        async () => await runtime.setCapabilityEnabled(target.id, enable, scope),
      );
      output.write(`${enable ? 'Enabled' : 'Disabled'} ${target.id} (${scope}).\n`);
      if (result.targetPath) {
        output.write(`Wrote profile: ${result.targetPath}\n`);
      }
    }
  };

  const runMiddlewareSetupMenu = async (): Promise<void> => {
    while (true) {
      const pipeline = runtime.listMiddlewarePipeline();
      output.write(`${runtime.getMiddlewareStartupSummary()}\n`);
      if (pipeline.length === 0) {
        output.write('No middleware pipeline entries found.\n');
        return;
      }

      const entries = pipeline.map((entry, index) => (
        `${index + 1}. ${entry.id}${entry.enabled === false ? ' (disabled)' : ''}${isLockedMiddlewareCapability(entry.id) ? ' [locked]' : ''}`
      ));
      const picked = await promptChoice(
        'Select middleware entry:',
        [...entries, 'Open config in editor', 'Done'],
      );
      if (!picked || picked === 'Done') {
        return;
      }

      if (picked === 'Open config in editor') {
        const editorScope = await promptConfigScope(false);
        if (!editorScope || editorScope === 'session') {
          output.write('Open-config cancelled.\n');
          continue;
        }
        const opened = await runtime.openConfigInEditor(editorScope);
        output.write(`Opened config: ${opened}\n`);
        continue;
      }

      const selectedIndex = entries.indexOf(picked);
      if (selectedIndex < 0 || selectedIndex >= pipeline.length) {
        output.write('Invalid middleware selection.\n');
        continue;
      }
      const selected = pipeline[selectedIndex];
        const action = await promptChoice(
          `Action for ${selected.id}:`,
          ['Toggle enabled', 'Move up', 'Move down', 'Apply preset', 'Edit config JSON', 'Show options', 'Back'],
        );
      if (!action || action === 'Back') {
        continue;
      }

      const scope = await promptConfigScope(true);
      if (!scope) {
        output.write('Scope selection cancelled.\n');
        continue;
      }

      if (action === 'Toggle enabled') {
        const nextPipeline = pipeline.map((entry, index) => (
          index === selectedIndex ? { ...entry, enabled: !entry.enabled } : entry
        ));
        const result = await runtime.setMiddlewarePipeline(nextPipeline, scope);
        output.write(`Updated ${selected.id} (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        continue;
      }

      if (action === 'Move up') {
        if (selectedIndex === 0) {
          output.write(`${selected.id} is already first.\n`);
          continue;
        }
        const nextPipeline = [...pipeline];
        const [entry] = nextPipeline.splice(selectedIndex, 1);
        nextPipeline.splice(selectedIndex - 1, 0, entry);
        const result = await runtime.setMiddlewarePipeline(nextPipeline, scope);
        output.write(`Moved ${selected.id} earlier (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        continue;
      }

      if (action === 'Move down') {
        if (selectedIndex >= pipeline.length - 1) {
          output.write(`${selected.id} is already last.\n`);
          continue;
        }
        const nextPipeline = [...pipeline];
        const [entry] = nextPipeline.splice(selectedIndex, 1);
        nextPipeline.splice(selectedIndex + 1, 0, entry);
        const result = await runtime.setMiddlewarePipeline(nextPipeline, scope);
        output.write(`Moved ${selected.id} later (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        continue;
      }

      if (action === 'Edit config JSON') {
        let configText = '';
        try {
          configText = (await ui.question(`JSON config for ${selected.id} (object): `)).trim();
        } catch (error) {
          if (!isReadlineClosedError(error)) {
            throw error;
          }
          ui = createUi();
          configText = (await ui.question(`JSON config for ${selected.id} (object): `)).trim();
        }
        if (!configText) {
          output.write('Config update cancelled.\n');
          continue;
        }
        let parsedConfig: unknown;
        try {
          parsedConfig = JSON.parse(configText);
        } catch (error) {
          output.write(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}\n`);
          continue;
        }
        if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
          output.write('Config must be a JSON object.\n');
          continue;
        }
        const result = await runtime.setMiddlewareConfig(selected.id, parsedConfig as Record<string, unknown>, scope);
        output.write(`Updated config for ${selected.id} (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        continue;
      }

      if (action === 'Apply preset') {
        const presets = runtime.getMiddlewareConfigPresets(selected.id);
        if (presets.length === 0) {
          output.write(`No presets available for ${selected.id}.\n`);
          continue;
        }
        const pickedPreset = await promptChoice(
          `Select preset for ${selected.id}:`,
          presets.map((preset) => preset.label),
        );
        if (!pickedPreset) {
          output.write('Preset selection cancelled.\n');
          continue;
        }
        const chosen = presets.find((preset) => preset.label === pickedPreset);
        if (!chosen) {
          output.write('Invalid preset selection.\n');
          continue;
        }
        const result = await runtime.setMiddlewareConfig(selected.id, chosen.config, scope);
        output.write(`Applied ${chosen.label} to ${selected.id} (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        continue;
      }

      if (action === 'Show options') {
        output.write(`${runtime.describeMiddlewareConfig(selected.id)}\n`);
        const edit = await promptChoice(
          `Set ${selected.id} option:`,
          selected.id === 'tool-calling' ? ['Set maxRounds', 'Back'] : ['Back'],
        );
        if (edit === 'Set maxRounds') {
          const picked = await promptChoice('maxRounds value:', ['8', '16', '24', '32', 'Custom'], '16');
          if (!picked) {
            output.write('maxRounds update cancelled.\n');
            continue;
          }
          let maxRoundsValue: number | undefined;
          if (picked === 'Custom') {
            let raw = '';
            try {
              raw = (await ui.question('Custom maxRounds (positive integer): ')).trim();
            } catch (error) {
              if (!isReadlineClosedError(error)) {
                throw error;
              }
              ui = createUi();
              raw = (await ui.question('Custom maxRounds (positive integer): ')).trim();
            }
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isInteger(parsed) || parsed <= 0) {
              output.write('Invalid maxRounds value.\n');
              continue;
            }
            maxRoundsValue = parsed;
          } else {
            maxRoundsValue = Number.parseInt(picked, 10);
          }
          const result = await runtime.setMiddlewareConfig(selected.id, { maxRounds: maxRoundsValue }, scope);
          output.write(`Updated ${selected.id}.maxRounds to ${maxRoundsValue} (${scope}).\n`);
          if (result.targetPath) {
            output.write(`Wrote profile: ${result.targetPath}\n`);
          }
        }
        continue;
      }
    }
  };

  const runSystemPromptSetup = async (): Promise<void> => {
    const current = runtime.profile.systemPrompt?.trim() || '';
    output.write(`Current system prompt: ${current || '<none>'}\n`);
    const next = await promptChoice(
      'Set system prompt:',
      ['Keep current', 'Edit text', 'Clear'],
      'Keep current',
    );
    if (!next || next === 'Keep current') {
      output.write('System prompt unchanged.\n');
      return;
    }
    if (next === 'Clear') {
      const scope = await promptConfigScope(true);
      if (!scope) {
        output.write('Scope selection cancelled.\n');
        return;
      }
      const result = await runtime.setSystemPrompt('', scope);
      output.write(`Cleared system prompt (${scope}).\n`);
      if (result.targetPath) {
        output.write(`Wrote profile: ${result.targetPath}\n`);
      }
      return;
    }
    let promptText = '';
    try {
      promptText = await ui.question('System prompt text (single line, use "clear" to remove): ');
    } catch (error) {
      if (!isReadlineClosedError(error)) {
        throw error;
      }
      ui = createUi();
      promptText = await ui.question('System prompt text (single line, use "clear" to remove): ');
    }
    const scope = await promptConfigScope(true);
    if (!scope) {
      output.write('Scope selection cancelled.\n');
      return;
    }
    const normalized = parseSessionSystemPromptInput(promptText);
    const result = await runtime.setSystemPrompt(normalized, scope);
    output.write(`Updated system prompt (${scope}).\n`);
    if (result.targetPath) {
      output.write(`Wrote profile: ${result.targetPath}\n`);
    }
  };

  const runStartupRecoveryWizard = async (errorMessage: string): Promise<boolean> => {
    output.write(`Provider startup error: ${errorMessage}\n`);
    output.write('Let’s recover your chat setup.\n');
    const action = await promptChoice(
      'Choose recovery action:',
      ['Switch provider', 'Set model', 'Use mock fallback', 'Cancel'],
    );
    if (!action || action === 'Cancel') {
      output.write('Startup cancelled.\n');
      return false;
    }

    if (action === 'Use mock fallback') {
      const next = await runtime.setProvider('mock');
      output.write(`Provider updated: ${next.provider} / ${next.model}\n`);
      return true;
    }

    if (action === 'Switch provider') {
      const picked = await promptChoice('Select provider:', PROVIDER_CHOICES, runtime.profile.provider);
      if (!picked) {
        output.write('Provider update cancelled.\n');
        return false;
      }
      const provider = asProviderChoice(picked);
      if (!provider) {
        output.write('Invalid provider. Recovery cancelled.\n');
        return false;
      }
      const next = await runtime.setProvider(provider);
      output.write(`Provider updated: ${next.provider} / ${next.model}\n`);
      return true;
    }

    const options = await withLoader(
      `Loading models for ${runtime.profile.provider}`,
      async () => await runtime.listSuggestedModels(runtime.profile.provider),
    );
    const model = await promptChoice(`Select model for ${runtime.profile.provider}:`, options, runtime.profile.model);
    if (!model) {
      output.write('Model update cancelled.\n');
      return false;
    }
      const next = await runtime.setModel(model);
      output.write(`Model updated: ${next.provider} / ${next.model}\n`);
    return true;
  };

  const ensureProviderReady = async (): Promise<void> => {
    while (true) {
      const startupError = runtime.getProviderStartupError();
      if (startupError) {
        const recovered = await runStartupRecoveryWizard(startupError);
        if (!recovered) {
          throw new Error('E6301: Chat startup cancelled due to provider configuration.');
        }
        continue;
      }

      try {
        await withLoader('Checking provider', async () => await runtime.probeProvider());
        output.write('Provider ready.\n');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const recovered = await runStartupRecoveryWizard(message);
        if (!recovered) {
          throw new Error('E6301: Chat startup cancelled due to provider configuration.');
        }
      }
    }
  };

  if (!parsed.prompt) {
    await ensureProviderReady();
  }

  const handleCommand = async (line: string): Promise<boolean> => {
    const trimmed = line.trim();
    if (!trimmed) {
      return true;
    }

    if (trimmed === '/exit' || trimmed === '/quit') {
      return false;
    }

    if (trimmed === '/help') {
      output.write('Commands: /help, /new, /provider [id], /model [name], /system-prompt [scope] [text], /tool-rounds [scope] [value], /tools, /skills, /middleware, /tools setup, /skills setup, /middleware setup, /enable <id> [scope], /disable <id> [scope], /tool-config <tool-id> <json> [scope], /tool-config-options <tool-id>, /middleware-config <middleware-id> <json> [scope], /middleware-config-options <middleware-id>, /official <category>, /install <tool|middleware> <name> [project|global], /install recipe <id> [project|global] [option], /allow-command <prefix> [scope], /open-config [project|global], /cancel, /sessions, /resume [sessionId], /delete-session <sessionId>, /search <query>, /branch [messageId], /exit\n');
      return true;
    }

      if (trimmed === '/new') {
        const sessionId = await withLoader('Starting new session', async () => await runtime.startNewSession());
        output.write(`Started new session ${sessionId}.\n`);
        return true;
      }

      if (trimmed === '/tools' || trimmed === '/skills' || trimmed === '/middleware') {
        const category = trimmed.slice(1) as CapabilityCategory;
        const mapped = capabilityTypeFromCategory(category);
        const capabilities = runtime.listCapabilities(mapped);
        output.write(`${category.toUpperCase()}:\n`);
        if (capabilities.length === 0) {
          output.write('  (none)\n');
          return true;
        }
        for (const capability of capabilities) {
          output.write(`- ${formatCapabilityStateRow(capability)}\n`);
        }
        if (category === 'middleware') {
          output.write(`${runtime.getMiddlewareStartupSummary()}\n`);
        }
        return true;
      }

      if (trimmed === '/tools setup' || trimmed === '/skills setup') {
        const category = trimmed.slice(1, -' setup'.length) as CapabilityCategory;
        await runCapabilitySetupMenu(category);
        return true;
      }

      if (trimmed === '/middleware setup') {
        const action = await promptChoice(
          'Middleware setup:',
          ['Configure pipeline', 'Set system prompt', 'Install RAG recommended recipe', 'Install RAG advanced recipe', 'Back'],
        );
        if (!action || action === 'Back') {
          return true;
        }
        if (action === 'Configure pipeline') {
          await runMiddlewareSetupMenu();
          return true;
        }
        if (action === 'Set system prompt') {
          await runSystemPromptSetup();
          return true;
        }
        if (action === 'Install RAG recommended recipe') {
          const scope = await promptChoice('Select install scope:', ['project', 'global'], 'project');
          if (!scope || (scope !== 'project' && scope !== 'global')) {
            output.write('Recipe install cancelled.\n');
            return true;
          }
          const result = await withLoader(
            'Installing rag-recommended',
            async () => await runtime.installRecipe('rag-recommended', scope),
          );
          if (result.status !== 'completed') {
            output.write(`Recipe failed at ${result.failedStep || 'unknown'}: ${result.error || 'unknown error'}\n`);
            return true;
          }
          output.write(`Installed recipe rag-recommended (${scope}).\n`);
          return true;
        }
        const backend = await promptChoice('Select backend for rag-advanced:', ['vectra', 'chroma', 'custom'], 'vectra');
        if (!backend) {
          output.write('Recipe install cancelled.\n');
          return true;
        }
        let customPackageName: string | undefined;
        if (backend === 'custom') {
          customPackageName = await promptChoice('Custom vector package:', ['@sisu-ai/vector-vectra'], '@sisu-ai/vector-vectra');
          if (!customPackageName) {
            output.write('Recipe install cancelled.\n');
            return true;
          }
        }
        const scope = await promptChoice('Select install scope:', ['project', 'global'], 'project');
        if (!scope || (scope !== 'project' && scope !== 'global')) {
          output.write('Recipe install cancelled.\n');
          return true;
        }
        const result = await withLoader(
          'Installing rag-advanced',
          async () => await runtime.installRecipe('rag-advanced', scope, {
            resolveChoice: async () => ({
              optionId: backend,
              customPackageName,
            }),
          }),
        );
        if (result.status !== 'completed') {
          output.write(`Recipe failed at ${result.failedStep || 'unknown'}: ${result.error || 'unknown error'}\n`);
          return true;
        }
        output.write(`Installed recipe rag-advanced (${scope}).\n`);
        return true;
      }
      if (trimmed === '/system-prompt') {
        output.write(`Current system prompt: ${runtime.profile.systemPrompt?.trim() || '<none>'}\n`);
        return true;
      }
      if (trimmed.startsWith('/system-prompt ')) {
        const payload = trimmed.slice('/system-prompt '.length).trim();
        const [scopeToken, ...rest] = payload.split(/\s+/);
        let scope: CapabilityScopeTarget = 'session';
        let promptText = payload;
        const maybeScope = parseScopeTarget(scopeToken);
        if (maybeScope) {
          scope = maybeScope;
          promptText = rest.join(' ');
        }
        const normalized = parseSessionSystemPromptInput(promptText);
        const result = await withLoader(
          'Updating system prompt',
          async () => await runtime.setSystemPrompt(normalized, scope),
        );
        output.write(`Updated system prompt (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        return true;
      }

      if (trimmed.startsWith('/official ')) {
        const category = trimmed.slice('/official '.length).trim();
        if (category !== 'middleware' && category !== 'tools' && category !== 'skills') {
          output.write("Usage: /official <middleware|tools|skills>\n");
          return true;
        }
        const packages = await withLoader(
          `Listing official ${category}`,
          async () => await runtime.listOfficialCapabilityPackages(category),
        );
        const diagnostics = runtime.getDiscoveryDiagnostics();
        if (diagnostics.length > 0) {
          output.write(`Discovery note: ${diagnostics[0]}\n`);
        }
        if (packages.length === 0) {
          output.write(`No official ${category} packages found.\n`);
          return true;
        }
        for (const pkg of packages) {
          output.write(`- ${pkg.name}@${pkg.version} ${pkg.description}\n`);
        }
        return true;
      }
      if (trimmed.startsWith('/install ')) {
        const payload = trimmed.slice('/install '.length).trim();
        const [typeRaw, nameRaw, scopeRaw, extraRaw] = payload.split(/\s+/, 4);
        if (typeRaw === 'recipe') {
          if (!nameRaw) {
            output.write('Usage: /install recipe <rag-recommended|rag-advanced> [project|global] [vectra|chroma|custom[:package]]\n');
            return true;
          }
          const scope: CapabilityInstallScope = scopeRaw === 'global' ? 'global' : 'project';
          let optionId = 'vectra';
          let customPackageName: string | undefined;
          if (extraRaw) {
            if (extraRaw.startsWith('custom:')) {
              optionId = 'custom';
              customPackageName = extraRaw.slice('custom:'.length).trim();
            } else {
              optionId = extraRaw;
            }
          }
          const result = await withLoader(
            `Installing recipe ${nameRaw}`,
            async () => await runtime.installRecipe(nameRaw, scope, {
              resolveChoice: async () => ({ optionId, customPackageName }),
            }),
          );
          if (result.status === 'cancelled') {
            output.write(`Recipe ${nameRaw} cancelled.\n`);
            return true;
          }
          if (result.status === 'failed') {
            output.write(`Recipe ${nameRaw} failed at ${result.failedStep || 'unknown step'}: ${result.error || 'unknown error'}\n`);
            output.write(`Completed steps: ${result.completedSteps.length}\n`);
            return true;
          }
          output.write(`Installed recipe ${nameRaw} (${scope}).\n`);
          return true;
        }
        if (!nameRaw || (typeRaw !== 'tool' && typeRaw !== 'middleware')) {
          output.write('Usage: /install <tool|middleware> <name> [project|global] OR /install recipe <id> [project|global] [option]\n');
          return true;
        }
        const scope: CapabilityInstallScope = scopeRaw === 'global' ? 'global' : 'project';
        const installed = await withLoader(
          `Installing ${typeRaw}`,
          async () => await runtime.installCapability(typeRaw, nameRaw, scope),
        );
        output.write(`Installed ${installed.packageName} as ${installed.capabilityId} (${scope}).\n`);
        output.write(`Install directory: ${installed.installDir}\n`);
        output.write(`Manifest: ${installed.manifestPath}\n`);
        return true;
      }

      if (trimmed.startsWith('/enable ') || trimmed.startsWith('/disable ')) {
        const enable = trimmed.startsWith('/enable ');
        const payload = trimmed.slice(enable ? '/enable '.length : '/disable '.length).trim();
        const [capabilityId, scopeRaw] = payload.split(/\s+/, 2);
        const scope = parseScopeTarget(scopeRaw) || 'session';
        if (!capabilityId) {
          output.write(`Usage: ${enable ? '/enable' : '/disable'} <capability-id> [session|project|global]\n`);
          return true;
        }
        const result = await withLoader(
          `${enable ? 'Enabling' : 'Disabling'} capability`,
          async () => await runtime.setCapabilityEnabled(capabilityId, enable, scope),
        );
        output.write(`${enable ? 'Enabled' : 'Disabled'} ${capabilityId} (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        return true;
      }

      if (trimmed.startsWith('/allow-command ')) {
        const payload = trimmed.slice('/allow-command '.length).trim();
        const [prefix, scopeRaw] = payload.split(/\s+/, 2);
        const scope = parseScopeTarget(scopeRaw) || 'session';
        if (!prefix) {
          output.write('Usage: /allow-command <prefix> [session|project|global]\n');
          return true;
        }
        const result = await withLoader(
          'Updating allow list',
          async () => await runtime.addAllowCommandPrefix(prefix, scope),
        );
        output.write(`Added allow prefix '${prefix}' (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        return true;
      }
      if (trimmed.startsWith('/tool-config ')) {
        const payload = trimmed.slice('/tool-config '.length);
        let command: ReturnType<typeof parseToolConfigCommandPayload>;
        try {
          command = parseToolConfigCommandPayload(payload);
        } catch (error) {
          output.write(`${error instanceof Error ? error.message : String(error)}\n`);
          return true;
        }
        const result = await withLoader(
          `Updating ${command.toolId} config`,
          async () => await runtime.setToolConfig(command.toolId, command.config, command.scope),
        );
        output.write(`Updated ${command.toolId} config (${command.scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        return true;
      }
      if (trimmed.startsWith('/tool-config-options ')) {
        const toolId = trimmed.slice('/tool-config-options '.length).trim();
        if (!toolId) {
          output.write('Usage: /tool-config-options <tool-id>\n');
          return true;
        }
        output.write(`${runtime.describeToolConfig(toolId)}\n`);
        return true;
      }
      if (trimmed.startsWith('/middleware-config ')) {
        const payload = trimmed.slice('/middleware-config '.length);
        let command: ReturnType<typeof parseMiddlewareConfigCommandPayload>;
        try {
          command = parseMiddlewareConfigCommandPayload(payload);
        } catch (error) {
          output.write(`${error instanceof Error ? error.message : String(error)}\n`);
          return true;
        }
        const result = await withLoader(
          `Updating ${command.middlewareId} config`,
          async () => await runtime.setMiddlewareConfig(command.middlewareId, command.config, command.scope),
        );
        output.write(`Updated ${command.middlewareId} config (${command.scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        return true;
      }
      if (trimmed.startsWith('/middleware-config-options ')) {
        const middlewareId = trimmed.slice('/middleware-config-options '.length).trim();
        if (!middlewareId) {
          output.write('Usage: /middleware-config-options <middleware-id>\n');
          return true;
        }
        output.write(`${runtime.describeMiddlewareConfig(middlewareId)}\n`);
        return true;
      }
      if (trimmed === '/tool-rounds') {
        output.write(`Current maxRounds: ${runtime.getToolCallingMaxRounds()}\n`);
        return true;
      }
      if (trimmed.startsWith('/tool-rounds ')) {
        const payload = trimmed.slice('/tool-rounds '.length).trim();
        const [scopeToken, valueToken] = payload.split(/\s+/, 2);
        let scope: CapabilityScopeTarget = 'session';
        let valueRaw = payload;
        const maybeScope = parseScopeTarget(scopeToken);
        if (maybeScope) {
          scope = maybeScope;
          valueRaw = valueToken || '';
        }
        const parsed = Number.parseInt(valueRaw, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          output.write('Usage: /tool-rounds [session|project|global] <positive-integer>\n');
          return true;
        }
        const result = await withLoader(
          'Updating tool-calling maxRounds',
          async () => await runtime.setMiddlewareConfig('tool-calling', { maxRounds: parsed }, scope),
        );
        output.write(`Updated tool-calling.maxRounds to ${parsed} (${scope}).\n`);
        if (result.targetPath) {
          output.write(`Wrote profile: ${result.targetPath}\n`);
        }
        return true;
      }

      if (trimmed === '/open-config' || trimmed.startsWith('/open-config ')) {
        const rawScope = trimmed.slice('/open-config'.length).trim();
        const scope = (rawScope === 'global' || rawScope === 'project') ? rawScope : 'project';
        const opened = await withLoader(
          `Opening ${scope} config`,
          async () => await runtime.openConfigInEditor(scope),
        );
        output.write(`Opened config: ${opened}\n`);
        return true;
      }

    if (trimmed === '/provider' || trimmed.startsWith('/provider ')) {
      const value = trimmed.slice('/provider'.length).trim();
      let provider = asProviderChoice(value);

      if (!provider) {
        const picked = await promptChoice(
          'Select provider:',
          PROVIDER_CHOICES,
          runtime.profile.provider,
        );
        if (!picked) {
          output.write('Provider update cancelled.\n');
          return true;
        }
        provider = asProviderChoice(picked);
      }

      if (!provider) {
        output.write('Invalid provider. Choose one of: ollama, openai, anthropic, mock.\n');
        return true;
      }

      try {
        const next = await withLoader('Updating provider', async () => await runtime.setProvider(provider));
        output.write(`Provider updated: ${next.provider} / ${next.model}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const recovered = await runStartupRecoveryWizard(message);
        if (!recovered) {
          output.write('Provider remains unchanged.\n');
        }
      }
      return true;
    }

    if (trimmed === '/model' || trimmed.startsWith('/model ')) {
      const value = trimmed.slice('/model'.length).trim();
      const model = value || await promptChoice(
        `Select model for ${runtime.profile.provider}:`,
        await withLoader(
          `Loading models for ${runtime.profile.provider}`,
          async () => await runtime.listSuggestedModels(runtime.profile.provider),
        ),
        runtime.profile.model,
      );

      if (!model) {
        output.write('Model update cancelled.\n');
        return true;
      }

      try {
        const next = await withLoader('Updating model', async () => await runtime.setModel(model));
        output.write(`Model updated: ${next.provider} / ${next.model}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const recovered = await runStartupRecoveryWizard(message);
        if (!recovered) {
          output.write('Model remains unchanged.\n');
        }
      }
      return true;
    }

    if (trimmed === '/cancel') {
      const cancelled = runtime.cancelActiveRun();
      output.write(cancelled ? 'Cancellation requested.\n' : 'No active run to cancel.\n');
      return true;
    }

    if (trimmed === '/sessions') {
      const sessions = await withLoader('Loading sessions', async () => await runtime.listSessions());
      if (sessions.length === 0) {
        output.write('No saved sessions.\n');
        return true;
      }
      for (const session of sessions) {
        output.write(`- ${session.sessionId} | ${session.updatedAt} | ${session.title}\n`);
      }
      const selected = await promptChoice('Select session to act on (or Enter to skip):', sessions.map((session) => session.sessionId));
      if (!selected) {
        return true;
      }
      const action = await promptChoice('Action:', ['Resume', 'Delete', 'Cancel']);
      if (action === 'Resume') {
        await withLoader('Resuming session', async () => await runtime.resumeSession(selected));
        output.write(`Resumed session ${selected}.\n`);
        writeLoadedSessionHistory(output, runtime.getState().messages);
      } else if (action === 'Delete') {
        const deleted = await withLoader('Deleting session', async () => await runtime.deleteSession(selected));
        output.write(deleted ? `Deleted session ${selected}.\n` : `Session not found: ${selected}.\n`);
      }
      return true;
    }

    if (trimmed.startsWith('/search ')) {
      const query = trimmed.slice('/search '.length).trim();
      const results = await withLoader('Searching sessions', async () => await runtime.searchSessions(query));
      for (const result of results) {
        output.write(`- ${result.sessionId} | ${result.updatedAt} | ${result.preview}\n`);
      }
      return true;
    }

    if (trimmed.startsWith('/resume ')) {
      const sessionId = trimmed.slice('/resume '.length).trim();
      await withLoader('Resuming session', async () => await runtime.resumeSession(sessionId));
      output.write(`Resumed session ${sessionId}.\n`);
      writeLoadedSessionHistory(output, runtime.getState().messages);
      return true;
    }

    if (trimmed.startsWith('/delete-session ')) {
      const sessionId = trimmed.slice('/delete-session '.length).trim();
      const deleted = await withLoader('Deleting session', async () => await runtime.deleteSession(sessionId));
      output.write(deleted ? `Deleted session ${sessionId}.\n` : `Session not found: ${sessionId}.\n`);
      return true;
    }

    if (trimmed.startsWith('/branch ')) {
      const messageId = trimmed.slice('/branch '.length).trim();
      const newSessionId = await withLoader('Creating branch session', async () => await runtime.branchFromMessage(messageId));
      output.write(`Created branch session ${newSessionId}.\n`);
      return true;
    }

    await runtime.runPrompt(trimmed);
    return true;
  };

  const onSignal = (signalName: string): void => {
    const cancelled = runtime.cancelActiveRun();
    output.write(cancelled ? `\nCancellation requested (${signalName}).\n` : '\nUse /exit to quit.\n');
  };

  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  const onSighup = () => onSignal('SIGHUP');

  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  process.on('SIGHUP', onSighup);

  try {
    while (true) {
      renderPromptContext();
      let inputLine: string;
      try {
        inputLine = await ui.question('> ');
      } catch (error) {
        if (isReadlineClosedError(error)) {
          const inputState = input as Readable & { readableEnded?: boolean; destroyed?: boolean; isTTY?: boolean };
          if (inputState.readableEnded || inputState.destroyed || inputState.isTTY === false) {
            break;
          }
          ui = createUi();
          continue;
        }
        throw error;
      }
      const shouldContinue = await handleCommand(inputLine);
      if (!shouldContinue) {
        break;
      }
    }
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.off('SIGHUP', onSighup);
    teardown();
    ui.close();
  }
}

function toProviderMessages(
  messages: ChatMessage[],
  currentAssistantMessageId: string,
  toolOutputs: string[],
  configuredSystemPrompt?: string,
): Message[] {
  const filtered = messages
    .filter((message) => message.id !== currentAssistantMessageId)
    .filter((message): message is ChatMessage & { role: 'system' | 'user' | 'assistant' } => (
      message.role === 'system' || message.role === 'user' || message.role === 'assistant'
    ))
    .map((message): Message => {
      if (message.role === 'system') {
        return { role: 'system', content: message.content };
      }
      if (message.role === 'assistant') {
        return { role: 'assistant', content: message.content };
      }
      return { role: 'user', content: message.content };
    });

  const normalizedSystemPrompt = configuredSystemPrompt?.trim() || '';
  const withSystem = normalizedSystemPrompt
    ? [{ role: 'system', content: normalizedSystemPrompt } as Message, ...filtered]
    : filtered;

  if (toolOutputs.length === 0) {
    return withSystem;
  }

  const lastUserIndex = [...withSystem].reverse().findIndex((message) => message.role === 'user');
  if (lastUserIndex === -1) {
    return withSystem;
  }

  const targetIndex = withSystem.length - 1 - lastUserIndex;
  const lastUser = withSystem[targetIndex];
  const withTools: Message = {
    role: 'user',
    content: `${lastUser.content}\n\nTool execution results:\n${toolOutputs.map((line, index) => `${index + 1}. ${line}`).join('\n')}`,
  };
  withSystem[targetIndex] = withTools;
  return withSystem;
}

function isReadlineClosedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'readline was closed';
}
