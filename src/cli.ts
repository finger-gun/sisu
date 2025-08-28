#!/usr/bin/env node
import { sisu, type Config } from './index.js';

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

  let prompt = args.chat;
  if (useStdin) {
    const stdinText = await readStdin();
    if (stdinText.trim().length > 0) prompt = stdinText;
  }

  const config: Config = { model, ...(system ? { system } : {}) };
  const client = sisu(config);

  try {
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
  } catch (err: any) {
    console.error(err?.message ?? String(err));
    process.exit(1);
  }
})();
