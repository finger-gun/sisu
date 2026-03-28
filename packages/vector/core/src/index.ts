export type {
  Embedding,
  VectorRecord,
  QueryRequest,
  QueryResult,
  VectorUpsertRequest,
  VectorQueryRequest,
  VectorDeleteRequest,
  VectorWriteResult,
  VectorStore,
} from './types.js';
export { dot, l2Norm, normalize, cosineSimilarity } from './math.js';
