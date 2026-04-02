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
  isInkEraseKey,
  initialInkAgentStatus,
  isInkNewlineKey,
  nextInkAgentStatus,
  toInkEventLines,
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
    expect(() => parseChatArgs(['--ui'])).toThrow("--ui is no longer supported. Use 'sisu chat' for interactive mode.");
  });

  test('isInkEraseKey handles control sequence fallback', () => {
    expect(isInkEraseKey('\x7f', {})).toBe(true);
    expect(isInkEraseKey('\b', {})).toBe(true);
    expect(isInkEraseKey('h', { ctrl: true })).toBe(true);
  });

  test('isInkNewlineKey covers multiline key paths', () => {
    expect(isInkNewlineKey('j', { ctrl: true })).toBe(true);
    expect(isInkNewlineKey('', { return: true, shift: true })).toBe(true);
    expect(isInkNewlineKey('\n', { return: true })).toBe(true);
    expect(isInkNewlineKey('\u001b[13;2u', {})).toBe(true);
    expect(isInkNewlineKey('x', {})).toBe(false);
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

  test('runChatCli /new command starts a fresh session', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-new-'));
    tempDirs.push(root);

    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({ provider: 'mock', model: 'sisu-mock-chat-v1', storageDir: path.join(root, 'sessions') }),
      'utf8',
    );

    const output: string[] = [];
    const outputStream = new PassThrough();
    outputStream.on('data', (chunk: Buffer | string) => {
      output.push(String(chunk));
    });

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await runChatCli([], { input: Readable.from(['/new\n', '/exit\n']), output: outputStream });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = output.join('');
    expect(rendered).toContain('Started new session session-');
  });

  test('runChatCli interactive provider picker works in non-tty mode', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-pickers-'));
    tempDirs.push(root);

    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({ provider: 'mock', model: 'sisu-mock-chat-v1', storageDir: path.join(root, 'sessions') }),
      'utf8',
    );

    const output: string[] = [];
    const outputStream = new PassThrough();
    outputStream.on('data', (chunk: Buffer | string) => {
      output.push(String(chunk));
    });

    async function* inputLines(): AsyncGenerator<string> {
      yield '/provider\n';
      await new Promise((resolve) => setTimeout(resolve, 0));
      yield '4\n';
      await new Promise((resolve) => setTimeout(resolve, 0));
      yield '/sessions\n';
      await new Promise((resolve) => setTimeout(resolve, 0));
      yield '/search hello\n';
      await new Promise((resolve) => setTimeout(resolve, 0));
      yield '/exit\n';
    }

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await runChatCli([], { input: Readable.from(inputLines()), output: outputStream });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = output.join('');
    expect(rendered).toContain('Select provider:');
    expect(rendered).toContain('Provider updated: mock / sisu-mock-chat-v1');
    expect(rendered).toContain('[mock/sisu-mock-chat-v1] [session');
  });

  test('runChatCli /sessions allows deleting and resuming from interactive list', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-session-actions-'));
    tempDirs.push(root);

    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({ provider: 'mock', model: 'sisu-mock-chat-v1', storageDir: path.join(root, 'sessions') }),
      'utf8',
    );

    const output: string[] = [];
    const outputStream = new PassThrough();
    outputStream.on('data', (chunk: Buffer | string) => {
      output.push(String(chunk));
    });

    const pause = async () => await new Promise((resolve) => setTimeout(resolve, 20));

    async function* inputLines(): AsyncGenerator<string> {
      yield 'hello world\n';
      await pause();
      yield '/sessions\n';
      await pause();
      yield '1\n';
      await pause();
      yield '2\n';
      await pause();
      yield '/exit\n';
    }

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await runChatCli([], { input: Readable.from(inputLines()), output: outputStream });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = output.join('');
    expect(rendered).toContain('Select session to act on');
    expect(rendered).toContain('Action:');
    expect(rendered).toContain('Deleted session');
  });

  test('runChatCli covers command matrix and recovery branches', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-matrix-'));
    tempDirs.push(root);

    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({ provider: 'mock', model: 'sisu-mock-chat-v1', storageDir: path.join(root, 'sessions') }),
      'utf8',
    );

    const output: string[] = [];
    const outputStream = new PassThrough();
    outputStream.on('data', (chunk: Buffer | string) => {
      output.push(String(chunk));
    });

    const pause = async () => await new Promise((resolve) => setTimeout(resolve, 20));
    async function* inputLines(): AsyncGenerator<string> {
      yield '/help\n';
      await pause();
      yield '/tools\n';
      await pause();
      yield '/skills\n';
      await pause();
      yield '/middleware\n';
      await pause();
      yield '/tools setup\n';
      await pause();
      yield 'terminal\n';
      await pause();
      yield 'Show details\n';
      await pause();
      yield '/tool-config-options terminal\n';
      await pause();
      yield 'Done\n';
      await pause();
      yield '/middleware-config-options tool-calling\n';
      await pause();
      yield '/middleware-config tool-calling {"maxRounds":22} session\n';
      await pause();
      yield '/system-prompt session Always be concise.\n';
      await pause();
      yield '/system-prompt\n';
      await pause();
      yield '/official wat\n';
      await pause();
      yield '/enable skills session\n';
      await pause();
      yield '/disable skills session\n';
      await pause();
      yield '/allow-command echo session\n';
      await pause();
      yield '/middleware setup\n';
      await pause();
      yield 'Open config in editor\n';
      await pause();
      yield 'project\n';
      await pause();
      yield 'Done\n';
      await pause();
      yield '/open-config project\n';
      await pause();
      yield '/provider openai\n';
      await pause();
      yield '4\n';
      await pause();
      yield '/provider openai\n';
      await pause();
      yield '3\n';
      await pause();
      yield '/provider\n';
      await pause();
      yield '\n';
      await pause();
      yield '/model\n';
      await pause();
      yield '\n';
      await pause();
      yield '/cancel\n';
      await pause();
      yield '/sessions\n';
      await pause();
      yield 'hello matrix\n';
      await pause();
      yield '/sessions\n';
      await pause();
      yield '1\n';
      await pause();
      yield '3\n';
      await pause();
      yield '/search matrix\n';
      await pause();
      yield '/delete-session missing\n';
      await pause();
      yield '/exit\n';
    }

    const previousEditor = process.env.EDITOR;
    const previousVisual = process.env.VISUAL;
    process.env.EDITOR = 'true';
    process.env.VISUAL = '';
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await runChatCli([], { input: Readable.from(inputLines()), output: outputStream });
    } finally {
      process.env.EDITOR = previousEditor;
      process.env.VISUAL = previousVisual;
      cwdSpy.mockRestore();
    }

    const rendered = output.join('');
    expect(rendered).toContain('TOOLS:');
    expect(rendered).toContain('SKILLS:');
    expect(rendered).toContain('MIDDLEWARE:');
    expect(rendered).toContain('Select tools capability:');
    expect(rendered).toContain('Action for terminal:');
    expect(rendered).toContain('terminal (enabled, source:core, inherited, locked-core)');
    expect(rendered).toContain('Terminal tool config: Shell permissions and command execution policy.');
    expect(rendered).toContain('Tool-calling middleware config: Controls automatic tool-call loop behavior.');
    expect(rendered).toContain('Updated tool-calling config (session).');
    expect(rendered).toContain('Updated system prompt (session).');
    expect(rendered).toContain('Current system prompt:');
    expect(rendered).toContain('Usage: /official <middleware|tools|skills>');
    expect(rendered).toContain('/install <tool|middleware> <name> [project|global]');
    expect(rendered).toContain('Enabled skills (session).');
    expect(rendered).toContain('Disabled skills (session).');
    expect(rendered).toContain("Added allow prefix 'echo' (session).");
    expect(rendered).toContain('Opened config:');
    expect(rendered).toContain('Provider remains unchanged.');
    expect(rendered).toContain('Provider updated: mock / sisu-mock-chat-v1');
    expect(rendered).toContain('Provider update cancelled.');
    expect(rendered).toContain('Model update cancelled.');
    expect(rendered).toContain('No active run to cancel.');
    expect(rendered).toContain('No saved sessions.');
    expect(rendered).toContain('Action:');
    expect(rendered).toContain('Session not found: missing.');
  });

  test('runChatCli /resume prints loaded session history', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-cli-resume-history-'));
    tempDirs.push(root);

    const profileDir = path.join(root, '.sisu');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(
      path.join(profileDir, 'chat-profile.json'),
      JSON.stringify({ provider: 'mock', model: 'sisu-mock-chat-v1', storageDir: path.join(root, 'sessions') }),
      'utf8',
    );

    const output: string[] = [];
    const outputStream = new PassThrough();
    outputStream.on('data', (chunk: Buffer | string) => {
      output.push(String(chunk));
    });

    const pause = async () => await new Promise((resolve) => setTimeout(resolve, 20));

    async function* inputLines(): AsyncGenerator<string> {
      yield 'first message\n';
      await pause();
      yield '/sessions\n';
      await pause();
      yield '1\n';
      await pause();
      yield '1\n';
      await pause();
      yield '/exit\n';
    }

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      await runChatCli([], { input: Readable.from(inputLines()), output: outputStream });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = output.join('');
    expect(rendered).toContain('Resumed session');
    expect(rendered).toContain('Loaded session history:');
    expect(rendered).toContain('You: first message');
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

  test('toInkEventLines maps event types to transcript lines', () => {
    const baseMessage = {
      id: 'm1',
      sessionId: 's1',
      role: 'assistant' as const,
      content: 'hello',
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(toInkEventLines({ type: 'assistant.message.completed', sessionId: 's1', runId: 'r1', message: baseMessage })
      .some((line) => line.text.includes('Assistant'))).toBe(true);
    expect(toInkEventLines({
      type: 'assistant.message.failed',
      sessionId: 's1',
      runId: 'r1',
      message: { ...baseMessage, status: 'failed' as const },
      errorCode: 'E',
      errorMessage: 'bad',
    })[0]?.text).toContain('Assistant failed');
    expect(toInkEventLines({
      type: 'tool.denied',
      sessionId: 's1',
      runId: 'r1',
      record: {
        id: 't1',
        sessionId: 's1',
        runId: 'r1',
        toolName: 'shell',
        requestPreview: 'echo',
        status: 'denied',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      reason: 'nope',
    })[0]?.text).toContain('Tool denied');
    expect(toInkEventLines({
      type: 'run.failed',
      sessionId: 's1',
      runId: 'r1',
      summary: { runId: 'r1', requestMessageId: 'm0', status: 'failed', completedSteps: 1 },
      errorCode: 'E',
      errorMessage: 'bad',
    })[0]?.text).toContain('Run failed');
    expect(toInkEventLines({
      type: 'error.raised',
      sessionId: 's1',
      code: 'E',
      message: 'boom',
    })[0]?.text).toContain('Error [E]: boom');
  });

  test('agent status reducer maps key runtime events', () => {
    const base = initialInkAgentStatus();
    const pendingTool = {
      id: 't1',
      sessionId: 's1',
      runId: 'r1',
      toolName: 'webSearch',
      requestPreview: 'q=test',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const thinking = nextInkAgentStatus(base, {
      type: 'assistant.message.started',
      sessionId: 's1',
      runId: 'r1',
      message: {
        id: 'm1',
        sessionId: 's1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(thinking.text).toContain('Thinking');

    const runningTool = nextInkAgentStatus(thinking, {
      type: 'tool.running',
      sessionId: 's1',
      runId: 'r1',
      record: { ...pendingTool, status: 'running' },
    });
    expect(runningTool.text).toContain('Running tool: webSearch');

    const failed = nextInkAgentStatus(runningTool, {
      type: 'run.failed',
      sessionId: 's1',
      runId: 'r1',
      summary: { runId: 'r1', requestMessageId: 'm0', status: 'failed', completedSteps: 1 },
      errorCode: 'RUN_FAILED',
      errorMessage: 'bad',
    });
    expect(failed.text).toContain('Failed');

    const completed = nextInkAgentStatus(failed, {
      type: 'run.completed',
      sessionId: 's1',
      runId: 'r1',
      summary: { runId: 'r1', requestMessageId: 'm0', status: 'completed', completedSteps: 2 },
    });
    expect(completed.text).toBe('Idle');
  });

  test('runtime provider/model update paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sisu-chat-switch-'));
    tempDirs.push(root);
    const runtime = await ChatRuntime.create({
      cwd: root,
      profile: {
        name: 'switch',
        provider: 'mock',
        model: 'sisu-mock-chat-v1',
        theme: 'plain',
        storageDir: path.join(root, 'sessions'),
        toolPolicy: mergeToolPolicy(),
      },
    });

    const next = await runtime.setProvider('mock');
    expect(next.provider).toBe('mock');
    expect(next.model).toBe('sisu-mock-chat-v1');

    const changedModel = await runtime.setModel('sisu-mock-chat-v2');
    expect(changedModel.model).toBe('sisu-mock-chat-v2');

    const suggestions = await runtime.listSuggestedModels('mock');
    expect(suggestions).toContain('sisu-mock-chat-v1');
  });
});
