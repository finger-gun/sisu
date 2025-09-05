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

export interface QueryResult {
  matches: Array<{
    id: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
}

