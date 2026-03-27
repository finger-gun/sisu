import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";
import type {
  VectorRecord,
  QueryRequest,
  QueryResult,
} from "@sisu-ai/vector-core";

type ChromaMetadataValue = string | number | boolean;

export interface EmbedOptions {
  model?: string;
  signal?: globalThis.AbortSignal;
}

export interface EmbeddingsProvider {
  embed(input: string[], opts?: EmbedOptions): Promise<number[][]>;
}

const DEFAULT_TOP_K = 4;
const MAX_TOP_K = 20;
const DEFAULT_CHUNK_SIZE = 800;
const MAX_CHUNK_SIZE = 4000;
const DEFAULT_MAX_CHUNKS = 24;
const MAX_MAX_CHUNKS = 100;

async function getCollection(name: string, url?: string) {
  const { ChromaClient } = await import("chromadb");
  const client = new ChromaClient({
    path: (url || process.env.CHROMA_URL || "http://localhost:8000") as string,
  });
  return client.getOrCreateCollection({ name });
}

function resolveNamespace(
  ctx: ToolContext,
  explicitNamespace?: string,
  fallbackNamespace = "sisu",
): string {
  const deps = (ctx?.deps ?? {}) as Record<string, unknown>;
  return (
    explicitNamespace ||
    (deps.vectorNamespace as string | undefined) ||
    fallbackNamespace
  );
}

function resolveChromaUrl(ctx: ToolContext): string | undefined {
  const deps = (ctx?.deps ?? {}) as Record<string, unknown>;
  return deps.chromaUrl as string | undefined;
}

function assertNotAborted(signal?: globalThis.AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}

function chunkText(text: string, chunkSize: number, maxChunks: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  for (let start = 0; start < trimmed.length; start += chunkSize) {
    if (chunks.length >= maxChunks) break;
    const end = Math.min(trimmed.length, start + chunkSize);
    chunks.push(trimmed.slice(start, end));
  }
  return chunks;
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

function resolveEmbeddingsProvider(
  ctx: ToolContext,
  provider?: EmbeddingsProvider,
): EmbeddingsProvider {
  const deps = (ctx?.deps ?? {}) as Record<string, unknown>;
  const fromDeps = deps.embeddings;
  if (provider) return provider;
  if (fromDeps && typeof fromDeps === "object" && "embed" in fromDeps) {
    return fromDeps as EmbeddingsProvider;
  }
  throw new Error(
    "Missing embeddings provider. Pass embeddings in tool options or ctx.deps.embeddings",
  );
}

const UpsertSchema = z.object({
  records: z.array(
    z.object({
      id: z.string(),
      embedding: z.array(z.number()),
      metadata: z.record(z.unknown()).optional(),
      namespace: z.string().optional(),
    }),
  ),
});

export const vectorUpsert: Tool<z.infer<typeof UpsertSchema>> = {
  name: "vector.upsert",
  description: "Upsert embeddings into ChromaDB",
  schema: UpsertSchema,
  handler: async ({ records }, ctx) => {
    assertNotAborted(ctx.signal);
    const collectionName = resolveNamespace(ctx);
    const collection = await getCollection(collectionName, resolveChromaUrl(ctx));
    await collection.add({
      ids: records.map((r) => r.id),
      embeddings: records.map((r) => r.embedding),
      metadatas: records.map(
        (r) =>
          toChromaMetadata(
            (r.metadata ?? {}) as Record<string, unknown>,
          ) as Record<string, string | number | boolean>,
      ),
    });
    return { count: records.length };
  },
};

const QuerySchema = z.object({
  embedding: z.array(z.number()),
  topK: z.number().int().positive(),
  filter: z.record(z.unknown()).optional(),
  namespace: z.string().optional(),
});

export const vectorQuery: Tool<z.infer<typeof QuerySchema>> = {
  name: "vector.query",
  description: "Query ChromaDB for nearest neighbors",
  schema: QuerySchema,
  handler: async ({ embedding, topK, filter, namespace }, ctx) => {
    assertNotAborted(ctx.signal);
    const collectionName = resolveNamespace(ctx, namespace);
    const collection = await getCollection(collectionName, resolveChromaUrl(ctx));
    const res = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      where: filter,
    });
    const out: QueryResult = {
      matches: (res.ids?.[0] || []).map((id: string, i: number) => ({
        id,
        score: res.distances?.[0]?.[i] ?? 0,
        metadata: res.metadatas?.[0]?.[i] ?? undefined,
      })),
    };
    return out;
  },
};

const DeleteSchema = z.object({ ids: z.array(z.string()) });

export const vectorDelete: Tool<z.infer<typeof DeleteSchema>> = {
  name: "vector.delete",
  description: "Delete embeddings by id from ChromaDB",
  schema: DeleteSchema,
  handler: async ({ ids }, ctx) => {
    assertNotAborted(ctx.signal);
    const collectionName = resolveNamespace(ctx);
    const collection = await getCollection(collectionName, resolveChromaUrl(ctx));
    await collection.delete({ ids });
    return { count: ids.length };
  },
};

const RetrieveContextSchema = z.object({
  queryText: z.string().min(1),
  topK: z.number().int().positive().max(MAX_TOP_K).optional(),
  filter: z.record(z.unknown()).optional(),
  namespace: z.string().optional(),
});

const StoreContextSchema = z.object({
  content: z.string().min(1),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  namespace: z.string().optional(),
  idPrefix: z.string().optional(),
  chunkSize: z.number().int().min(100).max(MAX_CHUNK_SIZE).optional(),
  maxChunks: z.number().int().positive().max(MAX_MAX_CHUNKS).optional(),
});

export type RetrieveContextResultItem = {
  id: string;
  score: number;
  text: string;
  citation: {
    id: string;
    source?: string;
    chunkIndex?: number;
  };
};

export type RetrieveContextResult = {
  total: number;
  items: RetrieveContextResultItem[];
};

export type StoreContextResult = {
  stored: number;
  totalChunks: number;
  truncated: boolean;
  ids: string[];
};

export interface RetrieveContextToolOptions {
  name?: string;
  description?: string;
  namespace?: string;
  defaultTopK?: number;
  maxTopK?: number;
  embeddings?: EmbeddingsProvider;
}

export interface StoreContextToolOptions {
  name?: string;
  description?: string;
  namespace?: string;
  chunkSize?: number;
  maxChunks?: number;
  embeddings?: EmbeddingsProvider;
}

export interface RagContextToolsOptions {
  namespace?: string;
  embeddings?: EmbeddingsProvider;
  // Defaults to false: low-level upsert is intended for controlled ingestion paths.
  includeUpsert?: boolean;
  retrieve?: Omit<RetrieveContextToolOptions, "namespace" | "embeddings">;
  store?: Omit<StoreContextToolOptions, "namespace" | "embeddings">;
}

function clampTopK(
  value: number | undefined,
  defaultTopK: number,
  maxTopK: number,
): number {
  const candidate = value ?? defaultTopK;
  return Math.max(1, Math.min(maxTopK, candidate));
}

function extractMatchText(metadata?: Record<string, unknown>): string {
  if (!metadata) return "";
  const text = metadata.text;
  if (typeof text === "string") return text;
  const chunk = metadata.chunk;
  if (typeof chunk === "string") return chunk;
  const content = metadata.content;
  if (typeof content === "string") return content;
  return "";
}

export function createRetrieveTool(
  options: RetrieveContextToolOptions = {},
): Tool<z.infer<typeof RetrieveContextSchema>, RetrieveContextResult> {
  const defaultTopK = clampTopK(options.defaultTopK, DEFAULT_TOP_K, MAX_TOP_K);
  const maxTopK = Math.max(defaultTopK, options.maxTopK ?? MAX_TOP_K);

  return {
    name: options.name || "retrieveContext",
    description:
      options.description ||
      "Embed query text and retrieve compact citation-ready context from Chroma.",
    schema: RetrieveContextSchema,
    handler: async ({ queryText, topK, filter, namespace }, ctx) => {
      assertNotAborted(ctx.signal);
      const embeddings = resolveEmbeddingsProvider(ctx, options.embeddings);
      const effectiveNamespace = options.namespace || namespace;
      const vectors = await embeddings.embed([queryText], { signal: ctx.signal });
      const [queryEmbedding] = vectors;
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        throw new Error("Embeddings provider returned an empty query embedding");
      }

      const boundedTopK = clampTopK(topK, defaultTopK, maxTopK);
      const queryResult = (await vectorQuery.handler(
        {
          embedding: queryEmbedding,
          topK: boundedTopK,
          filter,
          namespace: effectiveNamespace,
        },
        ctx,
      )) as QueryResult;

      const items = queryResult.matches
        .slice(0, boundedTopK)
        .map((match): RetrieveContextResultItem => {
          const metadata = (match.metadata ?? {}) as Record<string, unknown>;
          const source =
            typeof metadata.source === "string" ? metadata.source : undefined;
          const chunkIndex =
            typeof metadata.chunkIndex === "number"
              ? metadata.chunkIndex
              : undefined;
          return {
            id: match.id,
            score: match.score,
            text: extractMatchText(metadata),
            citation: {
              id: match.id,
              source,
              chunkIndex,
            },
          };
        });

      return {
        total: items.length,
        items,
      };
    },
  };
}

export function createStoreTool(
  options: StoreContextToolOptions = {},
): Tool<z.infer<typeof StoreContextSchema>, StoreContextResult> {
  const defaultChunkSize =
    options.chunkSize && options.chunkSize > 0
      ? Math.min(MAX_CHUNK_SIZE, options.chunkSize)
      : DEFAULT_CHUNK_SIZE;
  const defaultMaxChunks =
    options.maxChunks && options.maxChunks > 0
      ? Math.min(MAX_MAX_CHUNKS, options.maxChunks)
      : DEFAULT_MAX_CHUNKS;

  return {
    name: options.name || "storeContext",
    description:
      options.description ||
      "Store communication-derived content into Chroma for later semantic retrieval.",
    schema: StoreContextSchema,
    handler: async (
      { content, source, metadata, namespace, idPrefix, chunkSize, maxChunks },
      ctx,
    ) => {
      assertNotAborted(ctx.signal);
      const embeddings = resolveEmbeddingsProvider(ctx, options.embeddings);
      const effectiveNamespace = options.namespace || namespace;
      const effectiveChunkSize =
        chunkSize && chunkSize > 0
          ? Math.min(chunkSize, MAX_CHUNK_SIZE)
          : defaultChunkSize;
      const effectiveMaxChunks =
        maxChunks && maxChunks > 0
          ? Math.min(maxChunks, MAX_MAX_CHUNKS)
          : defaultMaxChunks;
      const chunks = chunkText(content, effectiveChunkSize, effectiveMaxChunks);
      if (chunks.length === 0) {
        throw new Error("storeContext requires non-empty content");
      }

      const vectors = await embeddings.embed(chunks, { signal: ctx.signal });
      if (vectors.length !== chunks.length) {
        throw new Error(
          `Expected ${chunks.length} embeddings, received ${vectors.length}`,
        );
      }

      const now = new Date().toISOString();
      const prefix =
        idPrefix ||
        `ctx_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      const records: VectorRecord[] = chunks.map((chunk, index) => {
        const merged = {
          ...(metadata || {}),
          text: chunk,
          source,
          chunkIndex: index,
          chunkCount: chunks.length,
          storedAt: now,
          kind: "conversation",
        } satisfies Record<string, unknown>;
        return {
          id: `${prefix}_${index + 1}`,
          embedding: vectors[index] || [],
          metadata: toChromaMetadata(merged),
          namespace: effectiveNamespace,
        };
      });

      const collection = await getCollection(
        resolveNamespace(ctx, effectiveNamespace),
        resolveChromaUrl(ctx),
      );
      await collection.add({
        ids: records.map((record) => record.id),
        embeddings: records.map((record) => record.embedding),
        metadatas: records.map(
          (record) =>
            (record.metadata ?? {}) as Record<string, string | number | boolean>,
        ),
      });

      return {
        stored: records.length,
        totalChunks: records.length,
        truncated: content.trim().length > chunks.join("").length,
        ids: records.map((record) => record.id),
      };
    },
  };
}

export const retrieveContext = createRetrieveTool();
export const storeContext = createStoreTool();

export function createRagContextTools(
  options: RagContextToolsOptions = {},
): Tool[] {
  const retrieveTool = createRetrieveTool({
    ...(options.retrieve || {}),
    namespace: options.namespace,
    embeddings: options.embeddings,
  });
  const storeTool = createStoreTool({
    ...(options.store || {}),
    namespace: options.namespace,
    embeddings: options.embeddings,
  });

  const tools: Tool[] = [retrieveTool, storeTool];
  if (options.includeUpsert === true) {
    tools.unshift(vectorUpsert);
  }
  return tools;
}

export const vectorTools = [
  vectorUpsert,
  vectorQuery,
  vectorDelete,
  retrieveContext,
  storeContext,
];

export type { VectorRecord, QueryRequest, QueryResult };

export default vectorTools;
