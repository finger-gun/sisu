import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";
import type { VectorStore } from "@sisu-ai/vector-core";
import {
  ragCoreDefaults,
  retrieveRagContext,
  storeRagContent,
  type ChunkingStrategy,
  type EmbeddingsProvider,
  type RetrieveResult,
  type StoreChunker,
  type StoreResult,
} from "@sisu-ai/rag-core";

function resolveEmbeddingsProvider(
  ctx: ToolContext,
  provider?: EmbeddingsProvider,
): EmbeddingsProvider {
  if (provider) return provider;
  const deps = (ctx?.deps ?? {}) as Record<string, unknown>;
  const fromDeps = deps.embeddings;
  if (fromDeps && typeof fromDeps === "object" && "embed" in fromDeps) {
    return fromDeps as EmbeddingsProvider;
  }
  throw new Error(
    "Missing embeddings provider. Pass embeddings in tool options or ctx.deps.embeddings",
  );
}

function resolveVectorStore(ctx: ToolContext, store?: VectorStore): VectorStore {
  if (store) return store;
  const deps = (ctx?.deps ?? {}) as Record<string, unknown>;
  const fromDeps = deps.vectorStore;
  if (
    fromDeps &&
    typeof fromDeps === "object" &&
    "upsert" in fromDeps &&
    "query" in fromDeps
  ) {
    return fromDeps as VectorStore;
  }
  throw new Error(
    "Missing vector store. Pass vectorStore in tool options or ctx.deps.vectorStore",
  );
}

const RetrieveSchema = z.object({
  queryText: z.string().min(1),
  topK: z.number().int().positive().max(ragCoreDefaults.maxTopK).optional(),
  filter: z.record(z.unknown()).optional(),
  namespace: z.string().optional(),
});

const StoreSchema = z.object({
  content: z.string().min(1),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  namespace: z.string().optional(),
  idPrefix: z.string().optional(),
  chunkingStrategy: z
    .enum(["characters", "sentences", "paragraphs"])
    .optional(),
  chunkSize: z.number().int().min(100).max(ragCoreDefaults.maxChunkSize).optional(),
  overlap: z.number().int().min(0).max(ragCoreDefaults.maxChunkOverlap).optional(),
  maxChunks: z.number().int().positive().max(ragCoreDefaults.maxMaxChunks).optional(),
});

export interface RetrieveToolOptions {
  name?: string;
  description?: string;
  namespace?: string;
  defaultTopK?: number;
  maxTopK?: number;
  embeddings?: EmbeddingsProvider;
  vectorStore?: VectorStore;
}

export interface StoreToolOptions {
  name?: string;
  description?: string;
  namespace?: string;
  chunkingStrategy?: ChunkingStrategy;
  chunkSize?: number;
  overlap?: number;
  maxChunks?: number;
  chunker?: StoreChunker;
  embeddings?: EmbeddingsProvider;
  vectorStore?: VectorStore;
}

export interface RagToolsOptions {
  namespace?: string;
  embeddings?: EmbeddingsProvider;
  vectorStore?: VectorStore;
  retrieve?: Omit<RetrieveToolOptions, "namespace" | "embeddings" | "vectorStore">;
  store?: Omit<StoreToolOptions, "namespace" | "embeddings" | "vectorStore">;
}

export function createRetrieveTool(
  options: RetrieveToolOptions = {},
): Tool<z.infer<typeof RetrieveSchema>, RetrieveResult> {
  return {
    name: options.name || "retrieveContext",
    description:
      options.description ||
      "Embed query text and retrieve compact citation-ready context from vector storage.",
    schema: RetrieveSchema,
    handler: async ({ queryText, topK, filter, namespace }, ctx) => {
      return retrieveRagContext({
        queryText,
        topK,
        filter,
        namespace: options.namespace || namespace,
        defaultTopK: options.defaultTopK,
        maxTopK: options.maxTopK,
        embeddings: resolveEmbeddingsProvider(ctx, options.embeddings),
        vectorStore: resolveVectorStore(ctx, options.vectorStore),
        signal: ctx.signal,
      });
    },
  };
}

export function createStoreTool(
  options: StoreToolOptions = {},
): Tool<z.infer<typeof StoreSchema>, StoreResult> {
  return {
    name: options.name || "storeContext",
    description:
      options.description ||
      "Store communication-derived content for later semantic retrieval.",
    schema: StoreSchema,
    handler: async (
      {
        content,
        source,
        metadata,
        namespace,
        idPrefix,
        chunkingStrategy,
        chunkSize,
        overlap,
        maxChunks,
      },
      ctx,
    ) => {
      return storeRagContent({
        content,
        source,
        metadata,
        namespace: options.namespace || namespace,
        idPrefix,
        chunkingStrategy: chunkingStrategy || options.chunkingStrategy,
        chunkSize: chunkSize ?? options.chunkSize,
        overlap: overlap ?? options.overlap,
        maxChunks: maxChunks ?? options.maxChunks,
        chunker: options.chunker,
        embeddings: resolveEmbeddingsProvider(ctx, options.embeddings),
        vectorStore: resolveVectorStore(ctx, options.vectorStore),
        signal: ctx.signal,
      });
    },
  };
}

export const retrieveContext = createRetrieveTool();
export const storeContext = createStoreTool();

export function createRagTools(options: RagToolsOptions = {}): Tool[] {
  return [
    createRetrieveTool({
      ...(options.retrieve || {}),
      namespace: options.namespace,
      embeddings: options.embeddings,
      vectorStore: options.vectorStore,
    }),
    createStoreTool({
      ...(options.store || {}),
      namespace: options.namespace,
      embeddings: options.embeddings,
      vectorStore: options.vectorStore,
    }),
  ];
}

export const ragTools = [retrieveContext, storeContext];

export type {
  ChunkingInput,
  ChunkingStrategy,
  EmbedOptions,
  EmbeddingsProvider,
  RetrieveResult,
  RetrieveResultItem,
  StoreChunker,
  StoreResult,
} from "@sisu-ai/rag-core";

export default ragTools;
