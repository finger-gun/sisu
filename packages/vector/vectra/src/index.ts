import path from "node:path";
import type {
  QueryResult,
  VectorDeleteRequest,
  VectorQueryRequest,
  VectorStore,
  VectorUpsertRequest,
} from "@sisu-ai/vector-core";
import { LocalIndex, type MetadataFilter } from "vectra";

export interface VectraVectorStoreOptions {
  folderPath?: string;
  namespace?: string;
  indexedMetadataFields?: string[];
  indexName?: string;
}

type VectraMetadataValue = string | number | boolean;
type VectraMetadata = Record<string, VectraMetadataValue>;

const DEFAULT_INDEXED_METADATA_FIELDS = [
  "source",
  "kind",
  "chunkIndex",
  "chunkCount",
  "storedAt",
  "docId",
] as const;

function assertNotAborted(signal?: globalThis.AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}

function isVectraMetadataValue(value: unknown): value is VectraMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function toVectraMetadata(metadata: Record<string, unknown>): VectraMetadata {
  const out: VectraMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    out[key] = isVectraMetadataValue(value) ? value : JSON.stringify(value);
  }
  return out;
}

function sanitizeFilterValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => sanitizeFilterValue(entry))
      .filter((entry) => entry !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (isVectraMetadataValue(value)) return value;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const sanitized = sanitizeFilterValue(nested);
      if (sanitized !== undefined) out[key] = sanitized;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return undefined;
}

function toVectraFilter(filter?: Record<string, unknown>): MetadataFilter | undefined {
  if (!filter) return undefined;
  const sanitized = sanitizeFilterValue(filter);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return undefined;
  }
  return sanitized as MetadataFilter;
}

function toNamespaceFolder(baseFolderPath: string, namespace: string): string {
  return path.join(baseFolderPath, encodeURIComponent(namespace));
}

async function ensureIndex(
  index: LocalIndex<VectraMetadata>,
  indexedMetadataFields: string[],
): Promise<void> {
  if (await index.isIndexCreated()) return;
  await index.createIndex({
    version: 1,
    metadata_config: {
      indexed: indexedMetadataFields,
    },
  });
}

export function createVectraVectorStore(
  options: VectraVectorStoreOptions = {},
): VectorStore {
  const baseFolderPath =
    options.folderPath ||
    process.env.VECTRA_PATH ||
    path.join(process.cwd(), ".sisu-vectra");
  const defaultNamespace = options.namespace || "sisu";
  const indexedMetadataFields = Array.from(
    new Set([
      ...DEFAULT_INDEXED_METADATA_FIELDS,
      ...(options.indexedMetadataFields || []),
    ]),
  );
  const indexes = new Map<string, LocalIndex<VectraMetadata>>();
  const writeQueues = new Map<string, Promise<void>>();

  function getIndex(namespace?: string): LocalIndex<VectraMetadata> {
    const resolvedNamespace = namespace || defaultNamespace;
    const cached = indexes.get(resolvedNamespace);
    if (cached) return cached;
    const index = new LocalIndex<VectraMetadata>(
      toNamespaceFolder(baseFolderPath, resolvedNamespace),
      options.indexName,
    );
    indexes.set(resolvedNamespace, index);
    return index;
  }

  async function withNamespaceWriteLock<T>(
    namespace: string | undefined,
    operation: (index: LocalIndex<VectraMetadata>) => Promise<T>,
  ): Promise<T> {
    const resolvedNamespace = namespace || defaultNamespace;
    const index = getIndex(resolvedNamespace);
    const previous = writeQueues.get(resolvedNamespace) || Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    writeQueues.set(resolvedNamespace, queued);

    await previous;
    try {
      return await operation(index);
    } finally {
      release();
      if (writeQueues.get(resolvedNamespace) === queued) {
        writeQueues.delete(resolvedNamespace);
      }
    }
  }

  return {
    async upsert({ records, namespace, signal }: VectorUpsertRequest) {
      assertNotAborted(signal);
      await withNamespaceWriteLock(namespace, async (index) => {
        await ensureIndex(index, indexedMetadataFields);
        await index.beginUpdate();
        try {
          for (const record of records) {
            await index.upsertItem({
              id: record.id,
              vector: record.embedding,
              metadata: toVectraMetadata(
                (record.metadata ?? {}) as Record<string, unknown>,
              ),
            });
          }
          await index.endUpdate();
        } catch (error) {
          index.cancelUpdate();
          throw error;
        }
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
      const resolvedNamespace = namespace || defaultNamespace;
      await (writeQueues.get(resolvedNamespace) || Promise.resolve());
      const index = getIndex(resolvedNamespace);
      if (!(await index.isIndexCreated())) {
        return { matches: [] };
      }
      const results = await index.queryItems(
        embedding,
        "",
        topK,
        toVectraFilter(filter),
      );
      return {
        matches: results.map((result) => ({
          id: result.item.id,
          score: result.score,
          metadata: result.item.metadata as Record<string, unknown>,
        })),
      };
    },
    async delete({ ids, namespace, signal }: VectorDeleteRequest) {
      assertNotAborted(signal);
      const deletedCount = await withNamespaceWriteLock(namespace, async (index) => {
        if (!(await index.isIndexCreated())) {
          return 0;
        }
        await index.beginUpdate();
        try {
          for (const id of ids) {
            await index.deleteItem(id);
          }
          await index.endUpdate();
        } catch (error) {
          index.cancelUpdate();
          throw error;
        }
        return ids.length;
      });
      return { count: deletedCount };
    },
  };
}
