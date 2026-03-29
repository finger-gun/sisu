import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
  loadResolvedProfile,
  mergeToolPolicy,
  parseChatArgs,
  parseOllamaListOutput,
  runChatCli,
  selectPreferredOllamaModel,
  suggestedModelForProvider,
  updateProjectProfile,
  validateAndNormalizeProfile,
} from '../src/lib.js';

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
      model: 'gpt-4o-mini',
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
