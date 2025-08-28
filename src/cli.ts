#!/usr/bin/env node
import { sisu, type Config, type Message } from './index.js';

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawVal] = arg.includes('=')
      ? arg.split(/=(.*)/, 2) as [string, string]
      : [arg, 'true'];
    const key = rawKey.replace(/^--/, '');
    const value: string | boolean = rawVal === 'true' ? true : rawVal;
    out[key] = value;
  }
  return out as {
    chat?: string;
    model?: string;
    system?: string;
    json?: boolean;
    stdin?: boolean;
    'no-inject-system'?: boolean;
    session?: boolean;
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    process.stdin.on('data', (c) => chunks.push(Buffer.from(c)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function extractAssistantText(resp: any): string | undefined {
  const msg = resp?.choices?.[0]?.message;
  const content = msg?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // join text parts if present
    const texts = content
      .filter((p: any) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text);
    if (texts.length) return texts.join('\n');
  }
  return undefined;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model ?? 'openai/gpt-4o-mini';
  const system = args.system;
  const useStdin = Boolean(args.stdin);
  const injectSystem = args['no-inject-system'] ? false : undefined; // let default logic decide
  const sessionMode = Boolean(args.session);

  let prompt = args.chat;
  if (useStdin) {
    const stdinText = await readStdin();
    if (stdinText.trim().length > 0) prompt = stdinText;
  }

  const config: Config = { model, ...(system ? { system } : {}) };
  const client = sisu(config);

  try {
    if (!sessionMode) {
      const response = await client.request(prompt ?? '', {
        ...(system ? { system } : {}),
        ...(injectSystem !== undefined ? { injectSystem } : {}),
      });
      if (args.json) {
        console.log(JSON.stringify(response, null, 2));
      } else {
        const text = extractAssistantText(response);
        console.log(text ?? JSON.stringify(response, null, 2));
      }
      return;
    }

    // Session mode (REPL-style conversation). Keeps messages in memory for this run.
    const messages: Message[] = [];
    if (system && injectSystem !== false) {
      messages.push({ role: 'system', content: system });
    }

    const { createInterface } = await import('node:readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    async function handleTurn(userInput: string) {
      if (!userInput.trim()) return;
      messages.push({ role: 'user', content: userInput });
      const resp: any = await client.chat(messages, model);
      const text = extractAssistantText(resp);
      const assistantContent =
        text ?? (resp?.choices?.[0]?.message?.content ? JSON.stringify(resp.choices[0].message.content) : '');
      if (assistantContent) {
        messages.push({ role: 'assistant', content: assistantContent });
      }
      if (args.json) {
        console.log(JSON.stringify(resp, null, 2));
      } else {
        console.log(assistantContent);
      }
    }

    // If an initial prompt was provided, handle it before entering REPL
    if (prompt && prompt.trim()) {
      await handleTurn(prompt);
    }

    const ask = () => new Promise<string>((resolve) => rl.question('you> ', resolve));
    console.log('Session started. Type ":q" or "exit" to quit.');
    while (true) {
      const line = await ask();
      if (line.trim() === ':q' || line.trim().toLowerCase() === 'exit') break;
      try {
        await handleTurn(line);
      } catch (e: any) {
        console.error(e?.message ?? String(e));
      }
    }
    rl.close();
  } catch (err: any) {
    console.error(err?.message ?? String(err));
    process.exit(1);
  }
})();
