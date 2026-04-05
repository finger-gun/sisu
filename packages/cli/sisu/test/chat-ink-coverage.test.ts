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

function sendCtrlC(input: Readable & { write: (data: string) => boolean }, delayMs: number): void {
  setTimeout(() => {
    input.write('\u0003');
  }, delayMs);
}

function sendCommand(input: Readable & { write: (data: string) => boolean }, command: string): void {
  const chars = [...command];
  chars.forEach((ch, index) => {
    setTimeout(() => {
      input.write(ch);
    }, index * 2);
  });
  setTimeout(() => {
    input.write('\r');
  }, Math.max(chars.length * 2 + 8, 12));
}

describe('chat ink coverage', () => {
  test('ink mode handles help, tools, unknown command, and exit', async () => {
    const root = await setupProfileRoot('sisu-ink-cov-');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const input = new FakeTTY();
    const output = new FakeTTY();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer | string) => chunks.push(String(chunk)));

    setTimeout(() => sendCommand(input, '/help'), 500);
    setTimeout(() => sendCommand(input, '/tools'), 900);
    setTimeout(() => sendCommand(input, '/wat'), 1300);
    setTimeout(() => sendCommand(input, '/exit'), 1700);
    sendCtrlC(input, 7000);

    try {
      await runChatCli([], { input, output });
    } finally {
      cwdSpy.mockRestore();
    }

    const rendered = chunks.join('');
    expect(rendered).toContain('Commands: /help');
    expect(rendered).toContain('/tools');
    expect(rendered).toContain('Unknown command: /wat');
  }, 15000);

  test('ink mode supports provider/model and resume/delete commands', async () => {
    const root = await setupProfileRoot('sisu-ink-cov-session-');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const input = new FakeTTY();
    const output = new FakeTTY();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer | string) => chunks.push(String(chunk)));

    setTimeout(() => sendCommand(input, '/provider mock'), 500);
    setTimeout(() => sendCommand(input, '/model sisu-mock-chat-v1'), 900);
    setTimeout(() => sendCommand(input, '/search sisu-ink-cov-session'), 1300);
    setTimeout(() => sendCommand(input, '/delete-session missing'), 1700);
    setTimeout(() => sendCommand(input, '/exit'), 2100);
    sendCtrlC(input, 7500);

    await runChatCli([], { input, output });

    cwdSpy.mockRestore();
    const rendered = chunks.join('');
    expect(rendered).toContain('Provider updated: mock / sisu-mock-chat-v1');
    expect(rendered).toContain('Model updated: mock / sisu-mock-chat-v1');
    expect(rendered).toContain('Session not found: missing.');
    expect(rendered).toContain('sisu-ink-cov-session');
  }, 15000);

  test('ink mode handles ctrl+c exit path', async () => {
    const root = await setupProfileRoot('sisu-ink-cov-ctrlc-');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);

    const input = new FakeTTY();
    const output = new FakeTTY();
    const chunks: string[] = [];
    output.on('data', (chunk: Buffer | string) => chunks.push(String(chunk)));

    sendCtrlC(input, 500);

    try {
      await runChatCli([], { input, output });
    } finally {
      cwdSpy.mockRestore();
    }

    expect(chunks.join('')).toContain('Ready. Type /help');
  });
});
