import { afterEach, describe, expect, test, vi } from 'vitest';

const createDefaultProviders = vi.fn(() => []);
const createRuntimeController = vi.fn(() => ({
  start: vi.fn(async () => ({ state: 'ready' })),
  stop: vi.fn(async () => ({ state: 'stopped' })),
}));
const serverStart = vi.fn(async () => ({ host: '127.0.0.1', port: 8787 }));
const serverStop = vi.fn(async () => undefined);
const createRuntimeHttpServer = vi.fn(() => ({
  start: serverStart,
  stop: serverStop,
}));

vi.mock('../src/index.js', () => ({
  createDefaultProviders,
  createRuntimeController,
  createRuntimeHttpServer,
}));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  createDefaultProviders.mockClear();
  createRuntimeController.mockClear();
  createRuntimeHttpServer.mockClear();
  serverStart.mockClear();
  serverStop.mockClear();
  delete process.env.RUNTIME_HOST;
  delete process.env.RUNTIME_PORT;
  delete process.env.RUNTIME_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.BASE_URL;
});

function mockProcess() {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as never);
  const on = vi.spyOn(process, 'on');
  return { out, err, exit, on };
}

describe('runtime-desktop cli', () => {
  test('starts server with env wiring and logs listening', async () => {
    process.env.RUNTIME_HOST = '0.0.0.0';
    process.env.RUNTIME_PORT = '9999';
    process.env.RUNTIME_API_KEY = 'token';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

    const proc = mockProcess();
    await import('../src/cli.ts');

    expect(createDefaultProviders).toHaveBeenCalledWith(expect.objectContaining({
      openAI: expect.objectContaining({ apiKey: 'openai-key' }),
      anthropic: expect.objectContaining({ apiKey: 'anthropic-key' }),
      ollama: { baseUrl: 'http://127.0.0.1:11434' },
    }));
    expect(createRuntimeHttpServer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ host: '0.0.0.0', port: 9999, apiKey: 'token' }),
    );
    expect(proc.out.mock.calls.some((call) => String(call[0]).includes('listening on http://127.0.0.1:8787'))).toBe(true);
    expect(proc.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(proc.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

    proc.out.mockRestore();
    proc.err.mockRestore();
    proc.exit.mockRestore();
    proc.on.mockRestore();
  });

  test('falls back when env port is invalid', async () => {
    process.env.RUNTIME_PORT = 'nope';
    const proc = mockProcess();

    await import('../src/cli.ts');
    expect(createRuntimeHttpServer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ port: 8787 }),
    );

    proc.out.mockRestore();
    proc.err.mockRestore();
    proc.exit.mockRestore();
    proc.on.mockRestore();
  });
});
