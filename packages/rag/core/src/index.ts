import type {
  QueryResult,
  VectorRecord,
  VectorStore,
} from "@sisu-ai/vector-core";

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
const DEFAULT_CHUNK_OVERLAP = 0;
const MAX_CHUNK_OVERLAP = 400;

export type ChunkingStrategy = "characters" | "sentences" | "paragraphs";

export interface ChunkingInput {
  content: string;
  chunkSize: number;
  maxChunks: number;
  overlap: number;
}

export type StoreChunker = (input: ChunkingInput) => string[];

export type RetrieveResultItem = {
  id: string;
  score: number;
  text: string;
  citation: {
    id: string;
    source?: string;
    chunkIndex?: number;
  };
};

export type RetrieveResult = {
  total: number;
  items: RetrieveResultItem[];
};

export type StoreResult = {
  stored: number;
  totalChunks: number;
  truncated: boolean;
  ids: string[];
};

export interface PrepareRagRecordsOptions {
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
  namespace?: string;
  idPrefix?: string;
  chunkingStrategy?: ChunkingStrategy;
  chunkSize?: number;
  overlap?: number;
  maxChunks?: number;
  chunker?: StoreChunker;
  embeddings: EmbeddingsProvider;
  signal?: globalThis.AbortSignal;
}

export interface PreparedRagRecords {
  records: VectorRecord[];
  chunks: string[];
  totalChunks: number;
  truncated: boolean;
  ids: string[];
}

export interface StoreRagContentOptions extends PrepareRagRecordsOptions {
  vectorStore: VectorStore;
}

export interface RetrieveRagContextOptions {
  queryText: string;
  topK?: number;
  filter?: Record<string, unknown>;
  namespace?: string;
  defaultTopK?: number;
  maxTopK?: number;
  embeddings: EmbeddingsProvider;
  vectorStore: VectorStore;
  signal?: globalThis.AbortSignal;
}

function assertNotAborted(signal?: globalThis.AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}

function normalizeChunkStrings(chunks: string[], maxChunks: number): string[] {
  return chunks.map((chunk) => chunk.trim()).filter(Boolean).slice(0, maxChunks);
}

function chunkUnits(
  units: string[],
  joiner: string,
  chunkSize: number,
  maxChunks: number,
  overlapUnits: number,
): string[] {
  if (units.length === 0) return [];
  const chunks: string[] = [];
  let index = 0;

  while (index < units.length && chunks.length < maxChunks) {
    let current = units[index] || "";
    let nextIndex = index + 1;

    while (nextIndex < units.length) {
      const candidate = `${current}${joiner}${units[nextIndex]}`;
      if (candidate.length > chunkSize && current.length > 0) {
        break;
      }
      current = candidate;
      nextIndex += 1;
    }

    chunks.push(current);
    if (nextIndex >= units.length) break;

    const overlappedIndex = Math.max(index + 1, nextIndex - overlapUnits);
    index = overlappedIndex;
  }

  return normalizeChunkStrings(chunks, maxChunks);
}

export function characterChunker(input: ChunkingInput): string[] {
  const chunkSize = Math.max(1, input.chunkSize);
  const overlap = Math.max(0, Math.min(chunkSize - 1, input.overlap));
  const step = Math.max(1, chunkSize - overlap);
  const trimmed = input.content.trim();
  if (!trimmed) return [];

  const chunks: string[] = [];
  for (let start = 0; start < trimmed.length; start += step) {
    if (chunks.length >= input.maxChunks) break;
    const end = Math.min(trimmed.length, start + chunkSize);
    chunks.push(trimmed.slice(start, end));
    if (end >= trimmed.length) break;
  }
  return normalizeChunkStrings(chunks, input.maxChunks);
}

export function sentenceChunker(input: ChunkingInput): string[] {
  const units = input.content
    .split(/(?<=[.!?])\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const overlapUnits = Math.max(0, Math.min(8, input.overlap));
  return chunkUnits(
    units,
    " ",
    Math.max(1, input.chunkSize),
    input.maxChunks,
    overlapUnits,
  );
}

export function paragraphChunker(input: ChunkingInput): string[] {
  const units = input.content
    .split(/\n\s*\n+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const overlapUnits = Math.max(0, Math.min(4, input.overlap));
  return chunkUnits(
    units,
    "\n\n",
    Math.max(1, input.chunkSize),
    input.maxChunks,
    overlapUnits,
  );
}

export function getChunker(strategy: ChunkingStrategy): StoreChunker {
  if (strategy === "sentences") return sentenceChunker;
  if (strategy === "paragraphs") return paragraphChunker;
  return characterChunker;
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

function buildStoreConfig(options: PrepareRagRecordsOptions) {
  return {
    strategy: options.chunkingStrategy || "characters",
    chunkSize:
      options.chunkSize && options.chunkSize > 0
        ? Math.min(MAX_CHUNK_SIZE, options.chunkSize)
        : DEFAULT_CHUNK_SIZE,
    overlap:
      options.overlap && options.overlap >= 0
        ? Math.min(MAX_CHUNK_OVERLAP, options.overlap)
        : DEFAULT_CHUNK_OVERLAP,
    maxChunks:
      options.maxChunks && options.maxChunks > 0
        ? Math.min(MAX_MAX_CHUNKS, options.maxChunks)
        : DEFAULT_MAX_CHUNKS,
  };
}

export async function prepareRagRecords(
  options: PrepareRagRecordsOptions,
): Promise<PreparedRagRecords> {
  assertNotAborted(options.signal);

  const config = buildStoreConfig(options);
  const selectedChunker = options.chunker || getChunker(config.strategy);
  const chunks = normalizeChunkStrings(
    selectedChunker({
      content: options.content,
      chunkSize: config.chunkSize,
      maxChunks: config.maxChunks,
      overlap: config.overlap,
    }),
    config.maxChunks,
  );

  if (chunks.length === 0) {
    throw new Error("storeContext requires non-empty content");
  }

  const vectors = await options.embeddings.embed(chunks, {
    signal: options.signal,
  });
  if (vectors.length !== chunks.length) {
    throw new Error(`Expected ${chunks.length} embeddings, received ${vectors.length}`);
  }

  const now = new Date().toISOString();
  const prefix =
    options.idPrefix ||
    `ctx_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const records: VectorRecord[] = chunks.map((chunk, index) => ({
    id: `${prefix}_${index + 1}`,
    embedding: vectors[index] || [],
    metadata: {
      ...(options.metadata || {}),
      text: chunk,
      source: options.source,
      chunkingStrategy: config.strategy,
      chunkIndex: index,
      chunkCount: chunks.length,
      storedAt: now,
      kind: "conversation",
    },
    namespace: options.namespace,
  }));

  return {
    records,
    chunks,
    totalChunks: records.length,
    truncated: options.content.trim().length > chunks.join("").length,
    ids: records.map((record) => record.id),
  };
}

export async function storeRagContent(
  options: StoreRagContentOptions,
): Promise<StoreResult> {
  const prepared = await prepareRagRecords(options);
  await options.vectorStore.upsert({
    records: prepared.records,
    namespace: options.namespace,
    signal: options.signal,
  });
  return {
    stored: prepared.records.length,
    totalChunks: prepared.totalChunks,
    truncated: prepared.truncated,
    ids: prepared.ids,
  };
}

export async function retrieveRagContext(
  options: RetrieveRagContextOptions,
): Promise<RetrieveResult> {
  assertNotAborted(options.signal);

  const boundedTopK = clampTopK(
    options.topK,
    options.defaultTopK ?? DEFAULT_TOP_K,
    Math.max(options.defaultTopK ?? DEFAULT_TOP_K, options.maxTopK ?? MAX_TOP_K),
  );

  const vectors = await options.embeddings.embed([options.queryText], {
    signal: options.signal,
  });
  const [queryEmbedding] = vectors;
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    throw new Error("Embeddings provider returned an empty query embedding");
  }

  const queryResult: QueryResult = await options.vectorStore.query({
    embedding: queryEmbedding,
    topK: boundedTopK,
    filter: options.filter,
    namespace: options.namespace,
    signal: options.signal,
  });

  const items = queryResult.matches
    .slice(0, boundedTopK)
    .map((match): RetrieveResultItem => {
      const metadata = (match.metadata ?? {}) as Record<string, unknown>;
      const source =
        typeof metadata.source === "string" ? metadata.source : undefined;
      const chunkIndex =
        typeof metadata.chunkIndex === "number" ? metadata.chunkIndex : undefined;
      return {
        id: match.id,
        score: match.score,
        text: extractMatchText(metadata),
        citation: { id: match.id, source, chunkIndex },
      };
    });

  return { total: items.length, items };
}

export const ragCoreDefaults = {
  defaultTopK: DEFAULT_TOP_K,
  maxTopK: MAX_TOP_K,
  defaultChunkSize: DEFAULT_CHUNK_SIZE,
  maxChunkSize: MAX_CHUNK_SIZE,
  defaultMaxChunks: DEFAULT_MAX_CHUNKS,
  maxMaxChunks: MAX_MAX_CHUNKS,
  defaultChunkOverlap: DEFAULT_CHUNK_OVERLAP,
  maxChunkOverlap: MAX_CHUNK_OVERLAP,
} as const;
