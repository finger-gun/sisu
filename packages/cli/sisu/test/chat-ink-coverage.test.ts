import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runChatCli } from '../src/lib.js';

class FakeTTY extends PassThrough {
  isTTY = true;

  columns = 100;

  rows = 30;

  setRawMode(): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function setupProfileRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  const profileDir = path.join(root, '.sisu');
  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(
    path.join(profileDir, 'chat-profile.json'),
    JSON.stringify({
      provider: 'mock',
      model: 'sisu-mock-chat-v1',
      storageDir: path.join(root, 'sessions'),
    }),
    'utf8',
  );
  return root;
}

function sendLine(input: Readable & { write: (data: string) => boolean }, value: string, delayMs: number): void {
  setTimeout(() => {
    for (const ch of value) {
      input.write(ch);
    }
    input.write('\n');
  }, delayMs);
}

function sendCtrlC(input: Readable & { write: (data: string) => boolean }, delayMs: number): void {
  setTimeout(() => {
    input.write('\u0003');
  }, delayMs);
}

describe('chat ink coverage', () => {
  test.skip('ink mode handles help, tools, unknown command, and exit', async () => {
    const root = await setupProfileRoot('sisu-ink-cov-');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const input = new FakeTTY();
    const output = new FakeTTY();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer | string) => chunks.push(String(chunk)));

    sendLine(input, '/help', 500);
    sendLine(input, '/tools', 900);
    sendLine(input, '/wat', 1300);
    sendLine(input, '/exit', 1700);

    try {
      await runChatCli([], { input, output });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = chunks.join('');
    expect(rendered).toContain('Commands: /help');
    expect(rendered).toContain('TOOLS:');
    expect(rendered).toContain('Unknown command: /wat');
  }, 15000);

  test.skip('ink mode supports provider/model and resume/delete commands', async () => {
    const root = await setupProfileRoot('sisu-ink-cov-session-');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const input = new FakeTTY();
    const output = new FakeTTY();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer | string) => chunks.push(String(chunk)));

    sendLine(input, '/provider mock', 500);
    sendLine(input, '/model sisu-mock-chat-v1', 900);
    sendLine(input, '/search hello', 1300);
    sendLine(input, '/delete-session missing', 1700);
    sendLine(input, '/exit', 2100);

    await runChatCli([], { input, output });

    cwdSpy.mockRestore();
    const rendered = chunks.join('');
    expect(rendered).toContain('Provider updated: mock / sisu-mock-chat-v1');
    expect(rendered).toContain('Model updated: mock / sisu-mock-chat-v1');
    expect(rendered).toContain('Session not found: missing.');
  }, 15000);

  test('ink mode handles ctrl+c exit path', async () => {
    const root = await setupProfileRoot('sisu-ink-cov-ctrlc-');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const input = new FakeTTY();
    const output = new FakeTTY();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer | string) => chunks.push(String(chunk)));

    setTimeout(() => {
      input.write('\u0003'); // Ctrl+C
    }, 500);

    try {
      await runChatCli([], { input, output });
    } finally {
      cwdSpy.mockRestore();
    }

    expect(chunks.join('')).toContain('Ready. Type /help');
  });
});
