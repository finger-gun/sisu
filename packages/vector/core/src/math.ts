import type { Embedding } from './types.js';

/**
 * Compute dot product between two vectors.
 */
export function dot(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Euclidean (L2) norm of a vector.
 */
export function l2Norm(v: Embedding): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/**
 * Return a unit vector in the same direction.
 */
export function normalize(v: Embedding): Embedding {
  const n = l2Norm(v);
  if (n === 0) throw new Error('Cannot normalize zero vector');
  return v.map((x) => x / n);
}

/**
 * Cosine similarity in [-1, 1].
 */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  const na = l2Norm(a);
  const nb = l2Norm(b);
  if (na === 0 || nb === 0) throw new Error('Cannot compute cosine for zero vector');
  return dot(a, b) / (na * nb);
}

