import type {
  QueryResult,
  VectorDeleteRequest,
  VectorQueryRequest,
  VectorStore,
  VectorUpsertRequest,
} from "@sisu-ai/vector-core";

export interface ChromaVectorStoreOptions {
  chromaUrl?: string;
  namespace?: string;
}

type ChromaMetadataValue = string | number | boolean;

function assertNotAborted(signal?: globalThis.AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}

async function getCollection(name: string, url?: string) {
  const { ChromaClient } = await import("chromadb");
  const client = new ChromaClient({
    path: (url || process.env.CHROMA_URL || "http://localhost:8000") as string,
  });
  return client.getOrCreateCollection({ name });
}

function toChromaMetadata(
  metadata: Record<string, unknown>,
): Record<string, ChromaMetadataValue> {
  const out: Record<string, ChromaMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    out[key] = JSON.stringify(value);
  }
  return out;
}

export function createChromaVectorStore(
  options: ChromaVectorStoreOptions = {},
): VectorStore {
  const defaultNamespace = options.namespace || "sisu";
  const chromaUrl = options.chromaUrl;

  return {
    async upsert({ records, namespace, signal }: VectorUpsertRequest) {
      assertNotAborted(signal);
      const collection = await getCollection(
        namespace || defaultNamespace,
        chromaUrl,
      );
      await collection.add({
        ids: records.map((record) => record.id),
        embeddings: records.map((record) => record.embedding),
        metadatas: records.map((record) =>
          toChromaMetadata((record.metadata ?? {}) as Record<string, unknown>),
        ),
      });
      return { count: records.length };
    },
    async query({
      embedding,
      topK,
      filter,
      namespace,
      signal,
    }: VectorQueryRequest): Promise<QueryResult> {
      assertNotAborted(signal);
      const collection = await getCollection(
        namespace || defaultNamespace,
        chromaUrl,
      );
      const result = await collection.query({
        queryEmbeddings: [embedding],
        nResults: topK,
        where: filter,
      });
      return {
        matches: (result.ids?.[0] || []).map((id: string, index: number) => ({
          id,
          score: result.distances?.[0]?.[index] ?? 0,
          metadata: result.metadatas?.[0]?.[index] ?? undefined,
        })),
      };
    },
    async delete({ ids, namespace, signal }: VectorDeleteRequest) {
      assertNotAborted(signal);
      const collection = await getCollection(
        namespace || defaultNamespace,
        chromaUrl,
      );
      await collection.delete({ ids });
      return { count: ids.length };
    },
  };
}
