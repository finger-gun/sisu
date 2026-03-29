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
import {
  type ChatCommandResult,
  type ChatEvent,
  type ChatMessage,
  type ChatRun,
  type ChatRunSummary,
  type ToolExecutionRecord,
} from './events.js';
import { type ChatState, applyChatEvent, createChatState, upsertChatRun } from './state.js';
import { type ChatProfile, type ChatProviderId, loadResolvedProfile } from './profiles.js';
import { FileSessionStore, type ChatSessionSnapshot } from './session-store.js';
import { TerminalRenderer } from './renderer.js';
import { type ToolRequest, evaluateToolRequest } from './tool-policy.js';

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
  readonly profile: ChatProfile;

  private readonly sessionStore: FileSessionStore;

  private readonly provider: ChatProvider;

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
    cwd: string;
    now: () => Date;
    confirmToolExecution: (request: ToolRequest, reason: string) => Promise<boolean>;
  }) {
    this.profile = options.profile;
    this.sessionStore = options.sessionStore;
    this.provider = options.provider;
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

    return new ChatRuntime({
      profile,
      state,
      sessionStore,
      provider: options?.provider || createProviderFromProfile(profile, options?.adapterFactories),
      cwd,
      now,
      confirmToolExecution: confirm,
    });
  }

  getState(): ChatState {
    return this.state;
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
      for await (const event of this.provider.streamResponse({ messages: providerMessages, signal })) {
        if (signal.aborted) {
          throw new Error('RUN_CANCELLED');
        }
        if (event.type === 'delta' && event.text) {
          assistantMessage.content += event.text;
          assistantMessage.updatedAt = isoNow(this.now);
          this.emit({
            type: 'assistant.token.delta',
            sessionId: this.state.sessionId,
            runId: run.id,
            messageId: assistantMessage.id,
            delta: event.text,
          });
        }
      }

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

    throw new Error(`Unknown chat option: ${token}`);
  }

  return parsed;
}

export async function runChatCli(argv: string[], io?: { input?: Readable; output?: Writable }): Promise<void> {
  const parsed = parseChatArgs(argv);
  const output = io?.output || stdout;
  const renderer = new TerminalRenderer({ output });

  const runtime = await ChatRuntime.create({
    sessionId: parsed.sessionId,
    confirmToolExecution: async (request, reason) => {
      const ui = createPromisesInterface({ input: io?.input || stdin, output });
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

  if (parsed.prompt) {
    try {
      await runtime.runPrompt(parsed.prompt);
    } finally {
      teardown();
    }
    return;
  }

  const ui: ReadlineInterface = createPromisesInterface({
    input: io?.input || stdin,
    output,
    terminal: true,
    historySize: 500,
  });

  output.write('Sisu Chat started. Commands: /help, /cancel, /sessions, /search <query>, /resume <sessionId>, /branch <messageId>, /exit\n');

  const handleCommand = async (line: string): Promise<boolean> => {
    const trimmed = line.trim();
    if (!trimmed) {
      return true;
    }

    if (trimmed === '/exit' || trimmed === '/quit') {
      return false;
    }

    if (trimmed === '/help') {
      output.write('Commands: /help, /cancel, /sessions, /search <query>, /resume <sessionId>, /branch <messageId>, /exit\n');
      return true;
    }

    if (trimmed === '/cancel') {
      const cancelled = runtime.cancelActiveRun();
      output.write(cancelled ? 'Cancellation requested.\n' : 'No active run to cancel.\n');
      return true;
    }

    if (trimmed === '/sessions') {
      const sessions = await runtime.listSessions();
      for (const session of sessions) {
        output.write(`- ${session.sessionId} | ${session.updatedAt} | ${session.title}\n`);
      }
      return true;
    }

    if (trimmed.startsWith('/search ')) {
      const query = trimmed.slice('/search '.length).trim();
      const results = await runtime.searchSessions(query);
      for (const result of results) {
        output.write(`- ${result.sessionId} | ${result.updatedAt} | ${result.preview}\n`);
      }
      return true;
    }

    if (trimmed.startsWith('/resume ')) {
      const sessionId = trimmed.slice('/resume '.length).trim();
      await runtime.resumeSession(sessionId);
      output.write(`Resumed session ${sessionId}.\n`);
      return true;
    }

    if (trimmed.startsWith('/branch ')) {
      const messageId = trimmed.slice('/branch '.length).trim();
      const newSessionId = await runtime.branchFromMessage(messageId);
      output.write(`Created branch session ${newSessionId}.\n`);
      return true;
    }

    await runtime.runPrompt(trimmed);
    return true;
  };

  const onSigint = (): void => {
    const cancelled = runtime.cancelActiveRun();
    output.write(cancelled ? '\nCancellation requested (SIGINT).\n' : '\nUse /exit to quit.\n');
  };

  process.on('SIGINT', onSigint);

  try {
    while (true) {
      const inputLine = await ui.question('> ');
      const shouldContinue = await handleCommand(inputLine);
      if (!shouldContinue) {
        break;
      }
    }
  } finally {
    process.off('SIGINT', onSigint);
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
