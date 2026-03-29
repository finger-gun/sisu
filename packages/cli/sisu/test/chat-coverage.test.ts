import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  type ChatProfile,
  type ChatProvider,
  ChatRuntime,
  FileSessionStore,
  TerminalRenderer,
  createProviderFromProfile,
  evaluateToolRequest,
  mergeToolPolicy,
  parseChatArgs,
  runChatCli,
} from '../src/lib.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function makeProfile(storageDir: string, provider: ChatProfile['provider'] = 'mock'): ChatProfile {
  return {
    name: 'coverage',
    provider,
    model: provider === 'openai' ? 'gpt-4o-mini' : provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'llama3.1',
    theme: 'plain',
    storageDir,
    toolPolicy: mergeToolPolicy(),
  };
}

function collectEvents(provider: ChatProvider, prompt = 'hello'): Promise<string> {
  return (async () => {
    const parts: string[] = [];
    const stream = provider.streamResponse({
      messages: [{ role: 'user', content: prompt }],
      signal: new AbortController().signal,
    });

    for await (const ev of stream) {
      if (ev.type === 'delta' && ev.text) {
        parts.push(ev.text);
      }
    }

    return parts.join('');
  })();
}

describe('chat coverage', () => {
  test('parseChatArgs validates missing values', () => {
    expect(() => parseChatArgs(['--session'])).toThrow('Missing value for --session');
    expect(() => parseChatArgs(['--prompt'])).toThrow('Missing value for --prompt');
  });

  test('tool policy covers empty, max-length, and balanced confirm paths', () => {
    const policy = mergeToolPolicy({ mode: 'balanced', allowCommandPrefixes: ['echo'], maxCommandLength: 3 });

    expect(evaluateToolRequest({ id: '1', toolName: 'shell', command: ' ' }, policy).action).toBe('deny');
    expect(evaluateToolRequest({ id: '2', toolName: 'shell', command: 'echo too-long' }, policy).action).toBe('deny');

    const balanced = mergeToolPolicy({ mode: 'balanced', allowCommandPrefixes: ['echo'], maxCommandLength: 999 });
    expect(evaluateToolRequest({ id: '3', toolName: 'shell', command: 'git status' }, balanced).action).toBe('confirm');

    const permissive = mergeToolPolicy({ mode: 'permissive', allowCommandPrefixes: [] });
    expect(evaluateToolRequest({ id: '4', toolName: 'shell', command: 'git status' }, permissive).action).toBe('allow');
  });

  test('provider factory covers async iterable and promise response paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cov-'));
    tempDirs.push(root);
    const profile = makeProfile(root, 'openai');

    const iterableProvider = createProviderFromProfile(profile, {
      createOpenAI: () => ({
        name: 'fake-openai',
        capabilities: { streaming: true },
        generate: (() => (async function* () {
          yield { type: 'assistant_message', message: { role: 'assistant', content: 'from-assistant-message' } };
        })()) as never,
      }),
      createAnthropic: () => ({ name: 'a', capabilities: {}, generate: (() => Promise.resolve({ message: { role: 'assistant', content: '' } })) as never }),
      createOllama: () => ({ name: 'o', capabilities: {}, generate: (() => Promise.resolve({ message: { role: 'assistant', content: '' } })) as never }),
    });

    const promiseProvider = createProviderFromProfile(profile, {
      createOpenAI: () => ({
        name: 'fake-openai-2',
        capabilities: { streaming: true },
        generate: (() => Promise.resolve({ message: { role: 'assistant', content: 'from-promise' } })) as never,
      }),
      createAnthropic: () => ({ name: 'a', capabilities: {}, generate: (() => Promise.resolve({ message: { role: 'assistant', content: '' } })) as never }),
      createOllama: () => ({ name: 'o', capabilities: {}, generate: (() => Promise.resolve({ message: { role: 'assistant', content: '' } })) as never }),
    });

    expect(await collectEvents(iterableProvider)).toContain('from-assistant-message');
    expect(await collectEvents(promiseProvider)).toContain('from-promise');
  });

  test('runtime covers deny, user-deny confirm, and command-failure branches', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cov-'));
    tempDirs.push(root);

    const store = new FileSessionStore(root);

    const strictRuntime = await ChatRuntime.create({
      profile: {
        ...makeProfile(root),
        toolPolicy: mergeToolPolicy({ mode: 'strict', allowCommandPrefixes: ['echo'] }),
      },
      sessionStore: store,
      confirmToolExecution: async () => false,
    });
    await strictRuntime.runPrompt('run: rm /tmp/nope');
    expect(strictRuntime.getState().toolExecutions.some((r) => r.status === 'denied')).toBe(true);

    const confirmRuntime = await ChatRuntime.create({
      profile: {
        ...makeProfile(root),
        toolPolicy: mergeToolPolicy({ mode: 'balanced', allowCommandPrefixes: ['echo'] }),
      },
      sessionStore: store,
      confirmToolExecution: async () => false,
    });
    await confirmRuntime.runPrompt('run: git status');
    expect(confirmRuntime.getState().toolExecutions.some((r) => r.denialReason === 'User denied action.')).toBe(true);

    const failedRuntime = await ChatRuntime.create({
      profile: {
        ...makeProfile(root),
        toolPolicy: mergeToolPolicy({ mode: 'balanced', allowCommandPrefixes: ['echo'] }),
      },
      sessionStore: store,
      confirmToolExecution: async () => true,
    });
    await failedRuntime.runPrompt('run: false');
    expect(failedRuntime.getState().toolExecutions.some((r) => r.status === 'failed')).toBe(true);
  });

  test('runtime cancellation path returns cancelled summary', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cancel-'));
    tempDirs.push(root);

    const slowProvider: ChatProvider = {
      id: 'slow',
      async *streamResponse(input) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (!input.signal.aborted) {
          yield { type: 'delta', text: 'late-token' };
        }
        yield { type: 'done' };
      },
    };

    const runtime = await ChatRuntime.create({
      profile: makeProfile(root),
      provider: slowProvider,
      sessionStore: new FileSessionStore(root),
    });

    const runPromise = runtime.runPrompt('hello cancel');
    await new Promise((resolve) => setTimeout(resolve, 1));
    const cancelled = runtime.cancelActiveRun();
    const result = await runPromise;

    expect(cancelled).toBe(true);
    expect(result.summary.status).toBe('cancelled');
  });

  test('runChatCli interactive mode validates writable output shape', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-'));
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

    const output: string[] = [];
    const outputStream = {
      write(chunk: string) {
        output.push(String(chunk));
        return true;
      },
    } as unknown as import('node:stream').Writable;

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await expect(runChatCli([], { input: Readable.from([]), output: outputStream })).rejects.toThrow('output.on is not a function');
    } finally {
      cwdSpy.mockRestore();
    }

    const text = output.join('');
    expect(text).toContain('Using mock provider.');
  });

  test('runChatCli resume and branch failures are surfaced', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-'));
    tempDirs.push(root);

    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({ provider: 'mock', model: 'sisu-mock-chat-v1', storageDir: path.join(root, 'sessions') }),
      'utf8',
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await expect(runChatCli([], { input: Readable.from(['/resume missing\n']) })).rejects.toThrow('Unknown session: missing');
      await expect(runChatCli([], { input: Readable.from(['/branch missing-msg\n']) })).rejects.toThrow(/Unknown (session|source message)/);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  test('renderer covers all event branches', () => {
    const out: string[] = [];
    const output = {
      write(chunk: string) {
        out.push(String(chunk));
        return true;
      },
    } as unknown as import('node:stream').Writable;

    const renderer = new TerminalRenderer({ output, disableColor: true });
    const base = {
      sessionId: 's1',
      runId: 'r1',
    };

    const msg = {
      id: 'm1',
      sessionId: 's1',
      runId: 'r1',
      role: 'assistant' as const,
      content: 'hi',
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    renderer.render({ type: 'user.submitted', ...base, message: { ...msg, role: 'user', status: 'completed' } });
    renderer.render({ type: 'assistant.message.started', ...base, message: { ...msg, status: 'streaming' } });
    renderer.render({ type: 'assistant.token.delta', ...base, messageId: 'm1', delta: 'token' });
    renderer.render({ type: 'assistant.message.completed', ...base, message: { ...msg, id: 'm2' } });
    renderer.render({ type: 'assistant.message.failed', ...base, message: { ...msg, status: 'failed' }, errorCode: 'E', errorMessage: 'x' });
    renderer.render({ type: 'assistant.message.cancelled', ...base, message: { ...msg, status: 'cancelled' } });
    renderer.render({ type: 'run.step.started', ...base, step: 's' });
    renderer.render({ type: 'run.step.completed', ...base, step: 's' });

    const rec = {
      id: 't1',
      sessionId: 's1',
      runId: 'r1',
      toolName: 'shell',
      requestPreview: 'echo hi',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    renderer.render({ type: 'tool.pending', ...base, record: rec });
    renderer.render({ type: 'tool.running', ...base, record: { ...rec, status: 'running' } });
    renderer.render({ type: 'tool.completed', ...base, record: { ...rec, status: 'completed' } });
    renderer.render({ type: 'tool.denied', ...base, record: { ...rec, status: 'denied' }, reason: 'no' });
    renderer.render({ type: 'tool.failed', ...base, record: { ...rec, status: 'failed' }, errorCode: 'E', errorMessage: 'bad' });
    renderer.render({ type: 'tool.cancelled', ...base, record: { ...rec, status: 'cancelled' } });

    renderer.render({ type: 'run.completed', ...base, summary: { runId: 'r1', requestMessageId: 'u1', status: 'completed', completedSteps: 1 } });
    renderer.render({ type: 'run.failed', ...base, summary: { runId: 'r1', requestMessageId: 'u1', status: 'failed', completedSteps: 1 }, errorCode: 'E', errorMessage: 'bad' });
    renderer.render({ type: 'run.cancelled', ...base, summary: { runId: 'r1', requestMessageId: 'u1', status: 'cancelled', completedSteps: 1 } });
    renderer.render({ type: 'session.saved', ...base });
    renderer.render({ type: 'error.raised', sessionId: 's1', code: 'E', message: 'bad' });

    expect(out.join('')).toContain('Assistant');
    expect(out.join('')).toContain('Run complete');
  });
});
