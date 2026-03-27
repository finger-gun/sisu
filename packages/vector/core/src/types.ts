export type Embedding = number[];

export interface VectorRecord {
  id: string;
  embedding: Embedding;
  metadata?: Record<string, unknown>;
  namespace?: string;
}

export interface QueryRequest {
  embedding: Embedding;
  topK: number;
  filter?: Record<string, unknown>;
  namespace?: string;
}

export interface VectorUpsertRequest {
  records: VectorRecord[];
  namespace?: string;
  signal?: globalThis.AbortSignal;
}

export interface VectorQueryRequest extends QueryRequest {
  signal?: globalThis.AbortSignal;
}

export interface VectorDeleteRequest {
  ids: string[];
  namespace?: string;
  signal?: globalThis.AbortSignal;
}

export interface VectorWriteResult {
  count: number;
}

export interface QueryResult {
  matches: Array<{
    id: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface VectorStore {
  upsert(input: VectorUpsertRequest): Promise<VectorWriteResult>;
  query(input: VectorQueryRequest): Promise<QueryResult>;
  delete?(input: VectorDeleteRequest): Promise<VectorWriteResult>;
}
