import { test, expect, vi } from 'vitest';
import type { Ctx, Tool, ToolRegistry } from '@sisu-ai/core';
import type { VectorStore } from '@sisu-ai/vector-core';
import { ragIngest, ragRetrieve, buildRagPrompt } from '../src/index.js';

const mkCtx = (toolsList: Tool[] = []): Ctx => {
  const map = new Map(toolsList.map(t => [t.name, t] as const));
  const tools: ToolRegistry = {
    list: () => toolsList,
    get: (n: string) => map.get(n),
    register: (t: Tool) => map.set(t.name, t)
  } as any;
  return {
    input: 'What is foo?',
    messages: [],
    model: { name: 'noop', capabilities: {}, generate: async () => ({ message: { role: 'assistant', content: '' } as any }) } as any,
    tools,
    memory: { get: async () => undefined, set: async () => {} } as any,
    stream: { write: () => {}, end: () => {} },
    state: {},
    signal: new AbortController().signal,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as Ctx;
};

test('ragIngest calls vectorStore.upsert and stores result', async () => {
  const vectorStore: VectorStore = {
    upsert: vi.fn(async (args) => ({ count: args.records?.length || 0 })),
    query: vi.fn(async () => ({ matches: [] })),
  };
  const ctx = mkCtx();
  (ctx.state as any).rag = { records: [{ id: '1', embedding: [0], metadata: { text: 'a' } }] };
  await ragIngest({ vectorStore })(ctx, async () => {});
  expect((ctx.state as any).rag.ingested.count).toBe(1);
});

test('ragRetrieve calls vectorStore.query and stores retrieval', async () => {
  const vectorStore: VectorStore = {
    upsert: vi.fn(async () => ({ count: 0 })),
    query: vi.fn(async () => ({ matches: [{ id: 'x', score: 0.1, metadata: { text: 'Chunk X' } }] })),
  };
  const ctx = mkCtx();
  (ctx.state as any).rag = { queryEmbedding: [0.1, 0.2, 0.3] };
  await ragRetrieve({ vectorStore, topK: 1 }) (ctx, async () => {});
  expect((ctx.state as any).rag.retrieval.matches[0].metadata.text).toContain('Chunk X');
});

test('buildRagPrompt adds a system message with context and question', async () => {
  const ctx = mkCtx();
  (ctx.state as any).rag = { retrieval: { matches: [{ id: '1', score: 0, metadata: { text: 'Doc A' } }] } };
  await buildRagPrompt() (ctx, async () => {});
  const sys = ctx.messages.at(-1)!;
  expect(sys.role).toBe('system');
  expect(sys.content).toMatch(/Doc A/);
  expect(sys.content).toMatch(/What is foo\?/);
});
