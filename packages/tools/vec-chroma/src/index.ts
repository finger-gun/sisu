import type { Tool, ToolContext } from "@sisu-ai/core";
import { z } from "zod";
import type {
  QueryRequest,
  QueryResult,
  VectorRecord,
  VectorStore,
} from "@sisu-ai/vector-core";
import { createChromaVectorStore } from "@sisu-ai/vector-chroma";

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

function resolveVectorStore(ctx: ToolContext): VectorStore {
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
  return createChromaVectorStore({
    chromaUrl: deps.chromaUrl as string | undefined,
    namespace: deps.vectorNamespace as string | undefined,
  });
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
  namespace: z.string().optional(),
});

export const vectorUpsert: Tool<z.infer<typeof UpsertSchema>> = {
  name: "vector.upsert",
  description: "Upsert embeddings into vector storage",
  schema: UpsertSchema,
  handler: async ({ records, namespace }, ctx) => {
    const vectorStore = resolveVectorStore(ctx);
    return vectorStore.upsert({
      records,
      namespace: resolveNamespace(ctx, namespace),
      signal: ctx.signal,
    });
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
  description: "Query vector storage for nearest neighbors",
  schema: QuerySchema,
  handler: async ({ embedding, topK, filter, namespace }, ctx) => {
    const vectorStore = resolveVectorStore(ctx);
    return vectorStore.query({
      embedding,
      topK,
      filter,
      namespace: resolveNamespace(ctx, namespace),
      signal: ctx.signal,
    });
  },
};

const DeleteSchema = z.object({
  ids: z.array(z.string()),
  namespace: z.string().optional(),
});

export const vectorDelete: Tool<z.infer<typeof DeleteSchema>> = {
  name: "vector.delete",
  description: "Delete embeddings by id from vector storage",
  schema: DeleteSchema,
  handler: async ({ ids, namespace }, ctx) => {
    const vectorStore = resolveVectorStore(ctx);
    if (!vectorStore.delete) {
      throw new Error("Configured vector store does not implement delete");
    }
    return vectorStore.delete({
      ids,
      namespace: resolveNamespace(ctx, namespace),
      signal: ctx.signal,
    });
  },
};

export const vectorPrimitiveTools = [vectorUpsert, vectorQuery, vectorDelete];
export const vectorTools = vectorPrimitiveTools;

export type { VectorRecord, QueryRequest, QueryResult };

export default vectorTools;
