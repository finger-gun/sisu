import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import * as profiles from '../src/chat/profiles.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  type ChatProfile,
  type ChatProvider,
  type ChatCommandResult,
  ChatRuntime,
  createProviderFromProfile,
  FileSessionStore,
  detectColorSupport,
  evaluateToolRequest,
  isInkEraseKey,
  isInkNewlineKey,
  loadResolvedProfile,
  mergeToolPolicy,
  parseChatArgs,
  parseOllamaListOutput,
  computeNovelStreamDelta,
  renderMarkdownLines,
  runChatCli,
  selectPreferredOllamaModel,
  suggestedModelForProvider,
  updateProjectProfile,
  validateAndNormalizeProfile,
} from '../src/lib.js';

vi.mock('@sisu-ai/tool-rag', () => ({
  default: [
    {
      name: 'retrieveContext',
      description: 'mock rag tool',
      schema: {},
      handler: async () => ({ ok: true }),
    },
  ],
}));

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function createMockProvider(text: string): ChatProvider {
  return {
    id: 'mock',
    async *streamResponse(): AsyncIterable<{ type: 'delta' | 'done'; text?: string }> {
      for (const token of text.split(/(\s+)/).filter(Boolean)) {
        yield { type: 'delta', text: token };
      }
      yield { type: 'done' };
    },
  };
}

describe('chat cli', () => {
  test('parseChatArgs parses known options', () => {
    expect(parseChatArgs(['--session', 'abc', '--prompt', 'hello'])).toEqual({
      sessionId: 'abc',
      prompt: 'hello',
    });
  });

  test('parseChatArgs rejects unknown options', () => {
    expect(() => parseChatArgs(['--wat'])).toThrow('Unknown chat option: --wat');
    expect(() => parseChatArgs(['--ui', 'ink'])).toThrow("--ui is no longer supported. Use 'sisu chat' for interactive mode.");
    expect(() => parseChatArgs(['--ink'])).toThrow("--ink is no longer supported. Use 'sisu chat' for interactive mode.");
  });

  test('tool policy evaluates deny and allow paths', () => {
    const strict = mergeToolPolicy({ mode: 'strict', allowCommandPrefixes: ['echo'] });

    const denied = evaluateToolRequest({ id: '1', toolName: 'shell', command: 'rm -rf /tmp/test' }, strict);
    expect(denied.action).toBe('deny');

    const allowed = evaluateToolRequest({ id: '2', toolName: 'shell', command: 'echo hi' }, strict);
    expect(allowed.action).toBe('allow');
  });

  test('detectColorSupport respects NO_COLOR and FORCE_COLOR', () => {
    expect(detectColorSupport({ NO_COLOR: '1' }, true)).toEqual({ enabled: false, level: 0 });
    expect(detectColorSupport({ FORCE_COLOR: '1' }, false)).toEqual({ enabled: true, level: 1 });
  });

  test('isInkEraseKey handles common erase inputs', () => {
    expect(isInkEraseKey('', { backspace: true })).toBe(true);
    expect(isInkEraseKey('', { delete: true })).toBe(true);
    expect(isInkEraseKey('\x7f', {})).toBe(true);
    expect(isInkEraseKey('\b', {})).toBe(true);
    expect(isInkEraseKey('h', { ctrl: true })).toBe(true);
    expect(isInkEraseKey('x', {})).toBe(false);
  });

  test('isInkNewlineKey handles multiline shortcuts', () => {
    expect(isInkNewlineKey('j', { ctrl: true })).toBe(true);
    expect(isInkNewlineKey('', { return: true, shift: true })).toBe(true);
    expect(isInkNewlineKey('', { return: true, meta: true })).toBe(true);
    expect(isInkNewlineKey('\n', { return: true })).toBe(true);
    expect(isInkNewlineKey('\u001b[13;2u', {})).toBe(true);
    expect(isInkNewlineKey('\u001b[27;2;13~', {})).toBe(true);
    expect(isInkNewlineKey('', { return: true })).toBe(false);
  });

  test('computeNovelStreamDelta deduplicates overlapping and cumulative chunks', () => {
    expect(computeNovelStreamDelta('', 'Hello')).toBe('Hello');
    expect(computeNovelStreamDelta('Hello', 'Hello world')).toBe(' world');
    expect(computeNovelStreamDelta('Hello', 'llo world')).toBe(' world');
    expect(computeNovelStreamDelta('Hello world', 'world')).toBe('');
    expect(computeNovelStreamDelta('Hello world', '!!!')).toBe('!!!');
  });

  test('renderMarkdownLines formats markdown tables', () => {
    const rendered = renderMarkdownLines([
      '| Feature | LMs | Generative AI |',
      '| :--- | :--- | :--- |',
      '| Focus | Language and reasoning | Any type of creative content |',
      '| Output | Text (mostly) | Text, Images, Audio |',
    ].join('\n'), { maxWidth: 60 });
    const text = rendered.map((line) => line.text).join('\n');
    expect(text).toContain('┌');
    expect(text).toContain('Feature');
    expect(text).toContain('Generative AI');
    expect(text).toContain('└');
  });

  test('renderMarkdownLines wraps wide table cells', () => {
    const rendered = renderMarkdownLines([
      '| Feature | Description |',
      '| :--- | :--- |',
      '| Focus | This is a very long description that should wrap across multiple lines in a narrow terminal table. |',
    ].join('\n'), { maxWidth: 44 });
    const tableLines = rendered.map((line) => line.text).filter((line) => line.includes('│'));
    expect(tableLines.length).toBeGreaterThan(2);
    expect(tableLines.join('\n')).toContain('very long');
    expect(tableLines.join('\n')).toContain('description that');
    expect(tableLines.join('\n')).toContain('narrow terminal');
  });

  test('profile validation reports field-level errors', () => {
    expect(() =>
      validateAndNormalizeProfile(
        {
          provider: 'invalid-provider',
          model: '',
          theme: 'neon',
          storageDir: '',
          toolPolicy: { mode: 'broken' },
        },
        {
          name: 'default',
          provider: 'mock',
          model: 'sisu-mock-chat-v1',
          theme: 'auto',
          storageDir: '/tmp/sisu',
          toolPolicy: mergeToolPolicy(),
        },
      ),
    ).toThrow('Invalid profile configuration');
  });

  test('createProviderFromProfile maps providers and rejects unsupported', () => {
    const baseProfile: ChatProfile = {
      name: 'p',
      provider: 'openai',
      model: 'gpt-5.4',
      theme: 'auto',
      storageDir: '/tmp/sisu',
      toolPolicy: mergeToolPolicy(),
    };

    const provider = createProviderFromProfile(baseProfile, {
      createOpenAI: () => ({ name: 'openai', capabilities: {}, generate: (() => { throw new Error('not used'); }) as never }),
      createAnthropic: () => ({ name: 'anthropic', capabilities: {}, generate: (() => { throw new Error('not used'); }) as never }),
      createOllama: () => ({ name: 'ollama', capabilities: {}, generate: (() => { throw new Error('not used'); }) as never }),
    });
    expect(provider.id).toBe('openai');

    const mockProvider = createProviderFromProfile({ ...baseProfile, provider: 'mock' });
    expect(mockProvider.id).toBe('mock');

    expect(() =>
      createProviderFromProfile(
        { ...baseProfile, provider: 'openai' },
        {
          createOpenAI: () => { throw new Error('boom'); },
          createAnthropic: () => ({ name: 'anthropic', capabilities: {}, generate: (() => { throw new Error('not used'); }) as never }),
          createOllama: () => ({ name: 'ollama', capabilities: {}, generate: (() => { throw new Error('not used'); }) as never }),
        },
      ),
    ).toThrow('boom');
  });

  test('runtime runs prompt and persists session records', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-'));
    tempDirs.push(root);

    const store = new FileSessionStore(root);
    const runtime = await ChatRuntime.create({
      sessionStore: store,
      provider: createMockProvider('hello world'),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
    });

    const result: ChatCommandResult = await runtime.runPrompt('run: echo hello');
    expect(result.summary.status).toBe('completed');

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0]?.messages.some((message) => message.role === 'assistant')).toBe(true);
    expect(sessions[0]?.toolExecutions.length).toBeGreaterThan(0);
  });

  test('runtime can auto-call terminal tools from natural language prompt', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-auto-tool-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      sessionStore: new FileSessionStore(root),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
      provider: {
        id: 'auto-tool-provider',
        async *streamResponse() {
          yield { type: 'done' };
        },
        async generateResponse(input) {
          const hasToolMessage = input.messages.some((m) => m.role === 'tool');
          if (!hasToolMessage) {
            return {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{
                  id: 'call-1',
                  name: 'terminalRun',
                  arguments: { command: 'pwd' },
                }],
              },
            };
          }

          const toolMsg = input.messages.find((m): m is { role: 'tool'; content: string } => m.role === 'tool');
          return {
            message: {
              role: 'assistant',
              content: `Tool output seen: ${toolMsg?.content || ''}`,
            },
          };
        },
      },
    });

    const result = await runtime.runPrompt('list current directory');
    expect(result.summary.status).toBe('completed');
    expect(runtime.getState().toolExecutions.some((record) => record.status === 'completed')).toBe(true);
    expect(result.assistantMessage?.content).toContain('Tool output seen:');
  });

  test('runtime can auto-call installed non-terminal tools', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-auto-installed-tool-'));
    tempDirs.push(root);

    const installDir = path.join(root, '.sisu', 'capabilities', 'tools', 'rag');
    await fs.mkdir(path.join(installDir, 'node_modules', '@sisu-ai', 'tool-rag'), { recursive: true });
    await fs.writeFile(
      path.join(installDir, 'node_modules', '@sisu-ai', 'tool-rag', 'package.json'),
      JSON.stringify({ name: '@sisu-ai/tool-rag', type: 'module', exports: './index.js' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(installDir, 'node_modules', '@sisu-ai', 'tool-rag', 'index.js'),
      'export { default } from "../../../../../../../../packages/tools/rag/src/index.ts";',
      'utf8',
    );
    await fs.mkdir(path.join(root, '.sisu', 'capabilities'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.sisu', 'capabilities', 'manifest.json'),
      JSON.stringify({
        version: 1,
        entries: [{
          id: 'tool-rag',
          type: 'tool',
          packageName: '@sisu-ai/tool-rag',
          installDir,
          installedAt: new Date().toISOString(),
        }],
      }, null, 2),
      'utf8',
    );

    const runtime = await ChatRuntime.create({
      cwd: root,
      sessionStore: new FileSessionStore(root),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
        capabilities: {
          tools: {
            enabled: ['tool-rag'],
            disabled: [],
            config: {},
          },
          skills: {
            enabled: [],
            disabled: [],
            directories: [path.join(root, '.sisu', 'skills')],
          },
          middleware: {
            enabled: ['error-boundary', 'invariants', 'register-tools', 'tool-calling', 'conversation-buffer', 'skills'],
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
      },
      provider: {
        id: 'auto-installed-tool-provider',
        async *streamResponse() {
          yield { type: 'done' };
        },
        async generateResponse(input) {
          const hasToolMessage = input.messages.some((m) => m.role === 'tool');
          if (!hasToolMessage) {
            return {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{
                  id: 'call-1',
                  name: 'retrieveContext',
                  arguments: { queryText: 'hello' },
                }],
              },
            };
          }
          return {
            message: {
              role: 'assistant',
              content: 'used installed tool',
            },
          };
        },
      },
    });

    const result = await runtime.runPrompt('use rag tool');
    expect(result.summary.status).toBe('completed');
    expect(runtime.getState().toolExecutions.some((record) => record.toolName === 'retrieveContext')).toBe(true);
    expect(result.assistantMessage?.content).toContain('used installed tool');
  });

  test('runtime auto tool-call loop returns graceful message after max rounds', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-auto-tool-loop-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      sessionStore: new FileSessionStore(root),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
      provider: {
        id: 'loop-provider',
        async *streamResponse() {
          yield { type: 'done' };
        },
        async generateResponse() {
          return {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'loop-call',
                name: 'terminalRun',
                arguments: { command: 'pwd' },
              }],
            },
          };
        },
      },
    });

    const result = await runtime.runPrompt('keep using tools forever');
    expect(result.summary.status).toBe('completed');
    expect(result.assistantMessage?.status).toBe('completed');
    expect(result.assistantMessage?.content).toContain('maximum tool-calling rounds');
  });

  test('runtime executes trace-viewer middleware when enabled and installed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-trace-viewer-'));
    tempDirs.push(root);
    const traceDir = path.join(root, 'traces');
    const installDir = path.join(root, '.sisu', 'capabilities', 'middleware', 'trace-viewer');
    await fs.mkdir(path.join(installDir, 'node_modules', '@sisu-ai', 'mw-trace-viewer'), { recursive: true });
    await fs.writeFile(
      path.join(installDir, 'node_modules', '@sisu-ai', 'mw-trace-viewer', 'package.json'),
      JSON.stringify({ name: '@sisu-ai/mw-trace-viewer', type: 'module', exports: './index.js' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(installDir, 'node_modules', '@sisu-ai', 'mw-trace-viewer', 'index.js'),
      'export { traceViewer } from "../../../../../../../../packages/middleware/trace-viewer/src/index.ts";',
      'utf8',
    );
    await fs.mkdir(path.join(root, '.sisu', 'capabilities'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.sisu', 'capabilities', 'manifest.json'),
      JSON.stringify({
        version: 1,
        entries: [{
          id: 'trace-viewer',
          type: 'middleware',
          packageName: '@sisu-ai/mw-trace-viewer',
          installDir,
          installedAt: new Date().toISOString(),
        }],
      }, null, 2),
      'utf8',
    );

    const previousTraceHtml = process.env.TRACE_HTML;
    const previousTraceJson = process.env.TRACE_JSON;
    process.env.TRACE_HTML = '1';
    process.env.TRACE_JSON = '0';
    try {
      const runtime = await ChatRuntime.create({
        cwd: root,
        sessionStore: new FileSessionStore(root),
        profile: {
          name: 'test',
          provider: 'mock',
          model: 'model-x',
          theme: 'plain',
          storageDir: root,
          toolPolicy: mergeToolPolicy(),
          capabilities: {
            tools: { enabled: ['terminal'], disabled: [], config: {} },
            skills: { enabled: [], disabled: [], directories: [path.join(root, '.sisu', 'skills')] },
            middleware: {
              enabled: ['error-boundary', 'invariants', 'register-tools', 'tool-calling', 'trace-viewer'],
              disabled: [],
              pipeline: [
                { id: 'error-boundary', enabled: true, config: {} },
                { id: 'invariants', enabled: true, config: {} },
                { id: 'register-tools', enabled: true, config: {} },
                { id: 'tool-calling', enabled: true, config: {} },
                { id: 'trace-viewer', enabled: true, config: { enable: true, dir: traceDir } },
              ],
            },
          },
        },
        provider: {
          id: 'trace-provider',
          async *streamResponse() {
            yield { type: 'done' };
          },
          async generateResponse() {
            return {
              message: {
                role: 'assistant',
                content: 'trace enabled',
              },
            };
          },
        },
      });

      const result = await runtime.runPrompt('hello trace');
      expect(result.summary.status).toBe('completed');
      expect(result.assistantMessage?.content).toContain('trace enabled');
    } finally {
      process.env.TRACE_HTML = previousTraceHtml;
      process.env.TRACE_JSON = previousTraceJson;
    }
  });

  test('runtime skips optional middleware that is enabled but not installed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-mw-skip-missing-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      cwd: root,
      sessionStore: new FileSessionStore(root),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
        capabilities: {
          tools: { enabled: ['terminal'], disabled: [], config: {} },
          skills: { enabled: [], disabled: [], directories: [path.join(root, '.sisu', 'skills')] },
          middleware: {
            enabled: ['error-boundary', 'invariants', 'register-tools', 'tool-calling', 'trace-viewer'],
            disabled: [],
              pipeline: [
                { id: 'error-boundary', enabled: true, config: {} },
                { id: 'invariants', enabled: true, config: {} },
                { id: 'register-tools', enabled: true, config: {} },
                { id: 'tool-calling', enabled: true, config: {} },
                { id: 'trace-viewer', enabled: true, config: {} },
              ],
            },
          },
        },
      provider: {
        id: 'missing-mw-provider',
        async *streamResponse() {
          yield { type: 'done' };
        },
        async generateResponse() {
          return {
            message: {
              role: 'assistant',
              content: 'ok even when optional middleware missing',
            },
          };
        },
      },
    });

    const result = await runtime.runPrompt('hello');
    expect(result.summary.status).toBe('completed');
    expect(result.assistantMessage?.content).toContain('ok even when optional middleware missing');
  });

  test('runtime can load trace-viewer from cli package dependencies', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-trace-viewer-cli-deps-'));
    tempDirs.push(root);
    const traceDir = path.join(root, 'traces');
    const previousTraceHtml = process.env.TRACE_HTML;
    const previousTraceJson = process.env.TRACE_JSON;
    process.env.TRACE_HTML = '1';
    process.env.TRACE_JSON = '0';

    try {
      const runtime = await ChatRuntime.create({
        cwd: root,
        sessionStore: new FileSessionStore(root),
        profile: {
          name: 'test',
          provider: 'mock',
          model: 'model-x',
          theme: 'plain',
          storageDir: root,
          toolPolicy: mergeToolPolicy(),
          capabilities: {
            tools: { enabled: ['terminal'], disabled: [], config: {} },
            skills: { enabled: [], disabled: [], directories: [path.join(root, '.sisu', 'skills')] },
            middleware: {
              enabled: ['error-boundary', 'invariants', 'register-tools', 'tool-calling', 'trace-viewer'],
              disabled: [],
              pipeline: [
                { id: 'error-boundary', enabled: true, config: {} },
                { id: 'invariants', enabled: true, config: {} },
                { id: 'register-tools', enabled: true, config: {} },
                { id: 'tool-calling', enabled: true, config: {} },
                { id: 'trace-viewer', enabled: true, config: {} },
              ],
            },
          },
        },
        provider: {
          id: 'trace-provider',
          async *streamResponse() {
            yield { type: 'done' };
          },
          async generateResponse() {
            return {
              message: {
                role: 'assistant',
                content: 'trace loaded from cli deps',
              },
            };
          },
        },
      });

      const result = await runtime.runPrompt('hello trace');
      expect(result.summary.status).toBe('completed');
      expect(result.assistantMessage?.content).toContain('trace loaded from cli deps');
    } finally {
      process.env.TRACE_HTML = previousTraceHtml;
      process.env.TRACE_JSON = previousTraceJson;
    }
  });

  test('runtime does not double-append streamed assistant tokens', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-stream-'));
    tempDirs.push(root);

    const streamProvider: ChatProvider = {
      id: 'stream-test',
      async *streamResponse() {
        yield { type: 'delta', text: 'Hello' };
        yield { type: 'delta', text: ' world' };
        yield { type: 'done' };
      },
    };

    const runtime = await ChatRuntime.create({
      sessionStore: new FileSessionStore(root),
      provider: streamProvider,
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
    });

    const result = await runtime.runPrompt('hello');
    expect(result.assistantMessage?.content).toBe('Hello world');
  });

  test('runtime supports resume, search, and branch workflow', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-'));
    tempDirs.push(root);

    const store = new FileSessionStore(root);
    const runtime = await ChatRuntime.create({
      sessionStore: store,
      provider: createMockProvider('assistant response'),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
    });

    await runtime.runPrompt('first message');
    const state = runtime.getState();
    const sessionId = state.sessionId;
    const messageId = state.messages.find((message) => message.role === 'assistant')?.id;
    expect(messageId).toBeTruthy();

    const search = await runtime.searchSessions('first');
    expect(search.some((entry) => entry.sessionId === sessionId)).toBe(true);

    await runtime.resumeSession(sessionId);
    const branchSessionId = await runtime.branchFromMessage(messageId!);
    expect(branchSessionId).not.toBe(sessionId);

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(2);
    const branch = sessions.find((entry) => entry.sessionId === branchSessionId);
    expect(branch?.lineage?.parentSessionId).toBe(sessionId);
    expect(branch?.lineage?.parentMessageId).toBe(messageId);

    const newSessionId = await runtime.startNewSession();
    expect(newSessionId).not.toBe(sessionId);
    expect(runtime.getState().sessionId).toBe(newSessionId);
    expect(runtime.getState().messages.length).toBe(0);
  });

  test('runtime create resumes explicit session id when snapshot exists', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-session-arg-'));
    tempDirs.push(root);
    const store = new FileSessionStore(root);

    const first = await ChatRuntime.create({
      sessionStore: store,
      provider: createMockProvider('assistant response'),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
    });
    await first.runPrompt('remember me');
    const savedId = first.getState().sessionId;

    const resumed = await ChatRuntime.create({
      sessionStore: store,
      sessionId: savedId,
      provider: createMockProvider('assistant response'),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
    });
    expect(resumed.getState().sessionId).toBe(savedId);
    expect(resumed.getState().messages.some((message) => message.content.includes('remember me'))).toBe(true);
  });

  test('runtime injects configured system prompt into provider messages', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-system-prompt-'));
    tempDirs.push(root);
    let sawSystemPrompt = false;
    const runtime = await ChatRuntime.create({
      sessionStore: new FileSessionStore(root),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
        systemPrompt: 'You are concise.',
      },
      provider: {
        id: 'sys-provider',
        async *streamResponse() {
          yield { type: 'done' };
        },
        async generateResponse(input) {
          sawSystemPrompt = input.messages.some((message) => message.role === 'system' && message.content === 'You are concise.');
          return {
            message: {
              role: 'assistant',
              content: 'ok',
            },
          };
        },
      },
    });
    await runtime.runPrompt('hello');
    expect(sawSystemPrompt).toBe(true);
  });

  test('runtime deleteSession removes snapshots and rotates active session when needed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-delete-'));
    tempDirs.push(root);

    const store = new FileSessionStore(root);
    const runtime = await ChatRuntime.create({
      sessionStore: store,
      provider: createMockProvider('assistant response'),
      profile: {
        name: 'test',
        provider: 'mock',
        model: 'model-x',
        theme: 'plain',
        storageDir: root,
        toolPolicy: mergeToolPolicy(),
      },
    });

    await runtime.runPrompt('message one');
    const currentSession = runtime.getState().sessionId;
    expect((await store.listSessions()).some((session) => session.sessionId === currentSession)).toBe(true);

    const deleted = await runtime.deleteSession(currentSession);
    expect(deleted).toBe(true);
    expect((await store.listSessions()).some((session) => session.sessionId === currentSession)).toBe(false);
    expect(runtime.getState().sessionId).not.toBe(currentSession);

    const missing = await runtime.deleteSession('session-missing');
    expect(missing).toBe(false);
  });

  test('runChatCli one-shot prompt writes streaming output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-oneshot-'));
    tempDirs.push(root);
    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({
        provider: 'mock',
        model: 'sisu-mock-chat-v1',
        theme: 'plain',
        storageDir: path.join(root, 'sessions'),
      }),
      'utf8',
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const outputChunks: string[] = [];
    const output = {
      write(chunk: string) {
        outputChunks.push(String(chunk));
        return true;
      },
    } as unknown as import('node:stream').Writable;

    try {
      await runChatCli(['--prompt', 'hello'], { output });
      const rendered = outputChunks.join('');
      expect(rendered).toContain('Assistant:');
      expect(rendered).toContain('Run complete');
    } finally {
      cwdSpy.mockRestore();
    }
  });

  test('runChatCli accepts piped stdin prompt', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-piped-'));
    tempDirs.push(root);
    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({
        provider: 'mock',
        model: 'sisu-mock-chat-v1',
        theme: 'plain',
        storageDir: path.join(root, 'sessions'),
      }),
      'utf8',
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    const outputChunks: string[] = [];
    const output = new PassThrough();
    output.on('data', (chunk: Buffer | string) => {
      outputChunks.push(String(chunk));
    });

    try {
      await runChatCli([], { input: Readable.from(['hello from pipe\n']), output });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = outputChunks.join('');
    expect(rendered).toContain('Assistant:');
    expect(rendered).toContain('Run complete');
  });

  test('profile helpers parse and select ollama models', () => {
    const output = `
NAME                     ID              SIZE      MODIFIED
qwen3.5:9b               abc             6.6 GB    now
llama3.1                 def             4.7 GB    now
`;
    const parsed = parseOllamaListOutput(output);
    expect(parsed).toEqual(['qwen3.5:9b', 'llama3.1']);
    expect(selectPreferredOllamaModel(parsed)).toBe('qwen3.5:9b');
    expect(suggestedModelForProvider('ollama', parsed)).toBe('qwen3.5:9b');
  });

  test('loadResolvedProfile defaults to ollama when unset and available', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-profile-'));
    tempDirs.push(root);
    const projectPath = path.join(root, '.sisu', 'chat-profile.json');
    const globalPath = path.join(root, 'global-profile.json');

    const profile = await loadResolvedProfile({
      cwd: root,
      homeDir: root,
      globalPath,
      projectPath,
      installedOllamaModels: ['qwen3.5:9b', 'embeddinggemma:latest'],
    });

    expect(profile.provider).toBe('ollama');
    expect(profile.model).toBe('qwen3.5:9b');
  });

  test('updateProjectProfile writes provider/model and runtime can switch', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-profile-'));
    tempDirs.push(root);
    const profilePath = path.join(root, '.sisu', 'chat-profile.json');

    const updated = await updateProjectProfile({ provider: 'mock', model: 'sisu-mock-chat-v1' }, {
      cwd: root,
      homeDir: root,
      projectPath: profilePath,
      globalPath: path.join(root, 'global-profile.json'),
    });
    expect(updated.provider).toBe('mock');
    expect(updated.model).toBe('sisu-mock-chat-v1');

    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: {
        ...updated,
        provider: 'mock',
      },
    });
    const next = await runtime.setModel('sisu-mock-chat-v1');
    expect(next.model).toBe('sisu-mock-chat-v1');
  });

  test('updateProjectProfile persists systemPrompt', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-profile-system-prompt-'));
    tempDirs.push(root);
    const profilePath = path.join(root, '.sisu', 'chat-profile.json');
    const updated = await updateProjectProfile(
      { provider: 'mock', model: 'sisu-mock-chat-v1', systemPrompt: 'Be direct and brief.' },
      {
        cwd: root,
        homeDir: root,
        projectPath: profilePath,
        globalPath: path.join(root, 'global-profile.json'),
      },
    );
    expect(updated.systemPrompt).toBe('Be direct and brief.');
  });

  test('ollama model suggestions only include installed models', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-ollama-list-'));
    tempDirs.push(root);

    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: {
        name: 'switch',
        provider: 'ollama',
        model: 'qwen3.5:0.8b',
        theme: 'plain',
        storageDir: path.join(root, 'sessions'),
        toolPolicy: mergeToolPolicy(),
      },
    });

    const listSpy = vi.spyOn(profiles, 'getInstalledOllamaModels').mockResolvedValue([
      'qwen3.5:9b',
      'qwen3.5:0.8b',
      'x/flux2-klein:9b',
      'embeddinggemma:latest',
      'qwen3.5:27b',
    ]);

    const suggestions = await runtime.listSuggestedModels('ollama');
    expect(suggestions).toEqual([
      'qwen3.5:9b',
      'qwen3.5:0.8b',
      'x/flux2-klein:9b',
      'embeddinggemma:latest',
      'qwen3.5:27b',
    ]);
    expect(suggestions).not.toContain('llama3.1');
    expect(suggestions).not.toContain('llama4');
    listSpy.mockRestore();
  });
});
