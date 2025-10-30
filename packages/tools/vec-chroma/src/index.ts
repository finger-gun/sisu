import type { Tool } from '@sisu-ai/core';
import { z } from 'zod';
import type { VectorRecord, QueryRequest, QueryResult } from '@sisu-ai/vector-core';

// Lazy import to make tests easier to mock and avoid hard dependency during type-time
async function getCollection(name: string, url?: string) {
  const { ChromaClient } = await import('chromadb');
  const client = new ChromaClient({ path: (url || process.env.CHROMA_URL || 'http://localhost:8000') as string });
  return client.getOrCreateCollection({ name });
}

const UpsertSchema = z.object({
  records: z.array(z.object({
    id: z.string(),
    embedding: z.array(z.number()),
    metadata: z.record(z.any()).optional(),
    namespace: z.string().optional(),
  }))
});

export const vectorUpsert: Tool<z.infer<typeof UpsertSchema>> = {
  name: 'vector.upsert',
  description: 'Upsert embeddings into ChromaDB',
  schema: UpsertSchema,
  handler: async ({ records }, ctx) => {
    const ns = (ctx?.deps as any)?.vectorNamespace || undefined;
    const collectionName = ns || 'sisu';
    const collection = await getCollection(collectionName, (ctx?.deps as any)?.chromaUrl);
    await collection.add({
      ids: records.map(r => r.id),
      embeddings: records.map(r => r.embedding),
      metadatas: records.map(r => r.metadata ?? {}),
    });
    return { count: records.length };
  }
};

const QuerySchema = z.object({
  embedding: z.array(z.number()),
  topK: z.number().int().positive(),
  filter: z.record(z.any()).optional(),
  namespace: z.string().optional(),
});

export const vectorQuery: Tool<z.infer<typeof QuerySchema>> = {
  name: 'vector.query',
  description: 'Query ChromaDB for nearest neighbors',
  schema: QuerySchema,
  handler: async ({ embedding, topK, filter, namespace }, ctx) => {
    const collectionName = namespace || (ctx?.deps as any)?.vectorNamespace || 'sisu';
    const collection = await getCollection(collectionName, (ctx?.deps as any)?.chromaUrl);
    const res = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      where: filter,
    });
    const out: QueryResult = {
      matches: (res.ids?.[0] || []).map((id: string, i: number) => ({
        id,
        score: (res.distances?.[0]?.[i] ?? 0),
        metadata: res.metadatas?.[0]?.[i] ?? undefined,
      }))
    };
    return out;
  }
};

const DeleteSchema = z.object({ ids: z.array(z.string()) });

export const vectorDelete: Tool<z.infer<typeof DeleteSchema>> = {
  name: 'vector.delete',
  description: 'Delete embeddings by id from ChromaDB',
  schema: DeleteSchema,
  handler: async ({ ids }, ctx) => {
    const collectionName = (ctx?.deps as any)?.vectorNamespace || 'sisu';
    const collection = await getCollection(collectionName, (ctx?.deps as any)?.chromaUrl);
    await collection.delete({ ids });
    return { count: ids.length };
  }
};

export const vectorTools = [vectorUpsert, vectorQuery, vectorDelete];

export type { VectorRecord, QueryRequest, QueryResult };

export default vectorTools;

