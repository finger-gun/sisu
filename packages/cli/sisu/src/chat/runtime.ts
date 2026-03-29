import { spawn } from 'node:child_process';
import type { Interface as ReadlineInterface } from 'node:readline/promises';
import { createInterface as createPromisesInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Writable } from 'node:stream';
import type { Readable } from 'node:stream';
import type { LLM, Message, ModelEvent, ModelResponse } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { anthropicAdapter } from '@sisu-ai/adapter-anthropic';
import { ollamaAdapter } from '@sisu-ai/adapter-ollama';
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
  getInstalledOllamaModels,
  loadResolvedProfile,
  suggestedModelForProvider,
  updateProjectProfile,
} from './profiles.js';
import { FileSessionStore, type ChatSessionSnapshot } from './session-store.js';
import { TerminalRenderer } from './renderer.js';
import { type ToolRequest, evaluateToolRequest } from './tool-policy.js';
import type { SessionStoreSearchResult } from './session-store.js';
import { renderMarkdownLines } from './markdown.js';

interface ProviderStreamInput {
  messages: Message[];
  signal: AbortSignal;
}

interface ProviderStreamEvent {
  type: 'delta' | 'done';
  text?: string;
}

export interface ChatProvider {
  id: string;
  streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamEvent>;
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
  }

  static async create(options?: ChatRuntimeOptions): Promise<ChatRuntime> {
    const cwd = options?.cwd || process.cwd();
    const profile = options?.profile || (await loadResolvedProfile({ cwd }));
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

    return new ChatRuntime({
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
    });
  }

  getProviderStartupError(): string | undefined {
    return this.providerStartupError;
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
    const toolOutputs: string[] = [];

    try {
      const analyzeStep = 'Analyze request';
      this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step: analyzeStep });
      run.stepSummaries.push(analyzeStep);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step: analyzeStep });

      for (let index = 0; index < toolRequests.length; index += 1) {
        const request = toolRequests[index];
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

      const synthesizeStep = 'Synthesize response';
      this.emit({ type: 'run.step.started', sessionId: this.state.sessionId, runId: run.id, step: synthesizeStep });
      run.stepSummaries.push(synthesizeStep);
      this.emit({ type: 'run.step.completed', sessionId: this.state.sessionId, runId: run.id, step: synthesizeStep });

      const providerMessages = toProviderMessages(this.state.messages, assistantMessage.id, toolOutputs);
      let streamedContent = '';
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

export type InkLineTone = 'normal' | 'muted' | 'info' | 'success' | 'warning' | 'error';

export interface InkTranscriptLine {
  text: string;
  tone: InkLineTone;
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
  return Boolean(key.ctrl) && value.toLowerCase() === 'j';
}

interface InkMenuItem {
  label: string;
  run: () => Promise<void>;
}

async function runInkChatCli(parsed: ChatCliArgs, io: { input: Readable; output: Writable }): Promise<void> {
  const React = await import('react');
  const ink = await import('ink');
  const { render, Box, Text, Static, useInput, useApp } = ink;
  const { createElement, useEffect, useRef, useState } = React;
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

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

    const openSettingsMenu = async (): Promise<void> => {
      openMenu('Settings', [
        { label: 'Switch provider', run: openProviderMenu },
        { label: 'Switch model', run: openModelMenu },
        { label: 'Sessions (resume/delete)', run: openSessionListMenu },
      ]);
    };

    const openOptionsMenu = async (): Promise<void> => {
      openMenu('Options', [
        { label: 'New session', run: async () => { const runtime = runtimeRef.current; if (runtime) { const id = await runtime.startNewSession(); appendLine(`Started new session ${id}.`, 'success'); } } },
        { label: 'Settings…', run: openSettingsMenu },
        { label: 'Sessions (resume/delete)', run: openSessionListMenu },
        { label: 'Branch from message', run: openBranchMenu },
        { label: 'Cancel active run', run: async () => { const runtime = runtimeRef.current; if (runtime) { const cancelled = runtime.cancelActiveRun(); appendLine(cancelled ? 'Cancellation requested.' : 'No active run to cancel.', cancelled ? 'warning' : 'muted'); } } },
        { label: 'Help', run: async () => { appendLine('Commands: /help, /new, /provider [id], /model [name], /cancel, /sessions, /resume [sessionId], /delete-session <sessionId>, /search <query>, /branch [messageId], /exit', 'muted'); } },
        { label: 'Exit', run: async () => { exit(); } },
      ]);
    };

    useEffect(() => {
      if (!busy) {
        return () => {};
      }
      const timer = setInterval(() => {
        setSpinnerFrame((value: number) => (value + 1) % spinnerFrames.length);
      }, 90);
      return () => clearInterval(timer);
    }, [busy]);

    useEffect(() => {
      if (!ready || busy) {
        setCursorVisible(true);
        return () => {};
      }
      const timer = setInterval(() => {
        setCursorVisible((value: boolean) => !value);
      }, 500);
      return () => clearInterval(timer);
    }, [ready, busy]);

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
        appendLine('Commands: /help, /new, /provider [id], /model [name], /cancel, /sessions, /resume [sessionId], /delete-session <sessionId>, /search <query>, /branch [messageId], /exit', 'muted');
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
      if (!trimmed.startsWith('/')) {
        appendLine(`You: ${trimmed}`, 'info');
      }
      if (!runtime) {
        appendLine('Runtime is not ready yet.', 'warning');
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
      } finally {
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

    output.write('Sisu Chat started. Commands: /help, /new, /provider [id], /model [name], /cancel, /sessions, /resume <sessionId>, /delete-session <sessionId>, /search <query>, /branch <messageId>, /exit\n');
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
      output.write('Commands: /help, /new, /provider [id], /model [name], /cancel, /sessions, /resume [sessionId], /delete-session <sessionId>, /search <query>, /branch [messageId], /exit\n');
      return true;
    }

    if (trimmed === '/new') {
      const sessionId = await withLoader('Starting new session', async () => await runtime.startNewSession());
      output.write(`Started new session ${sessionId}.\n`);
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

function toProviderMessages(messages: ChatMessage[], currentAssistantMessageId: string, toolOutputs: string[]): Message[] {
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

  if (toolOutputs.length === 0) {
    return filtered;
  }

  const lastUserIndex = [...filtered].reverse().findIndex((message) => message.role === 'user');
  if (lastUserIndex === -1) {
    return filtered;
  }

  const targetIndex = filtered.length - 1 - lastUserIndex;
  const lastUser = filtered[targetIndex];
  const withTools: Message = {
    role: 'user',
    content: `${lastUser.content}\n\nTool execution results:\n${toolOutputs.map((line, index) => `${index + 1}. ${line}`).join('\n')}`,
  };
  filtered[targetIndex] = withTools;
  return filtered;
}

function isReadlineClosedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'readline was closed';
}
