import { test, expect } from 'vitest';
import { summarizeText } from '../src/index.js';

function makeCtx(summary: string) {
  return {
    signal: undefined,
    model: {
      name: 'dummy',
      capabilities: { functionCall: false },
      async generate(_messages: any[]) { return { message: { role: 'assistant', content: summary } } as any; }
    }
  } as any;
}

test('summarizeText returns condensed output', async () => {
  const ctx = makeCtx('short summary with https://example.com');
  const res: any = await summarizeText.handler({ text: 'A'.repeat(5000), includeCitations: true } as any, ctx);
  expect(res.summary).toContain('short summary');
  expect(res.urls[0]).toBe('https://example.com');
});

