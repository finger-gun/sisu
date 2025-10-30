import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '@sisu-ai/core';

// Mock chromadb module shape used in the adapter
vi.mock('chromadb', () => {
  const add = vi.fn(async () => {});
  const query = vi.fn(async () => ({ ids: [["a","b"]], distances: [[0.1, 0.2]], metadatas: [[{ text: 'A' }, { text: 'B' }]] }));
  const del = vi.fn(async () => {});
  const getOrCreateCollection = vi.fn(async () => ({ add, query, delete: del }));
  return {
    ChromaClient: vi.fn().mockImplementation(() => ({ getOrCreateCollection }))
  };
});

import { vectorUpsert, vectorQuery, vectorDelete } from '../src/index.js';

const baseCtx = {
  log: { info: vi.fn(), debug: vi.fn() },
  signal: new AbortController().signal,
  memory: { get: vi.fn(), set: vi.fn() },
  model: {} as any
} as unknown as ToolContext;

describe('vec-chroma tools', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('upsert sends ids, embeddings, metadatas', async () => {
    const res: any = await vectorUpsert.handler({ records: [
      { id: '1', embedding: [0.1, 0.2, 0.3], metadata: { text: 'T1' } },
      { id: '2', embedding: [0.4, 0.5, 0.6] },
    ] } as any, baseCtx);
    expect(res.count).toBe(2);
  });

  test('query returns matches with id, score, metadata', async () => {
    const out: any = await vectorQuery.handler({ embedding: [0,1], topK: 2 }, baseCtx);
    expect(out.matches.length).toBe(2);
    expect(out.matches[0].id).toBe('a');
    expect(out.matches[0].metadata?.text).toBe('A');
  });

  test('delete accepts ids', async () => {
    const res: any = await vectorDelete.handler({ ids: ['1','2'] } as any, baseCtx);
    expect(res.count).toBe(2);
  });
});

