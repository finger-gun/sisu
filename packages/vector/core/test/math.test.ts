import { describe, it, expect } from 'vitest';
import { dot, l2Norm, normalize, cosineSimilarity } from '../src/index.js';

describe('@sisu-ai/vector-core math', () => {
  it('dot product works', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('dot product throws on dimension mismatch', () => {
    expect(() => dot([1, 2], [1])).toThrow(/Dimension mismatch/);
  });

  it('l2 norm works', () => {
    expect(l2Norm([3, 4])).toBe(5);
  });

  it('normalize returns unit vector', () => {
    const u = normalize([3, 4]);
    expect(l2Norm(u)).toBeCloseTo(1, 10);
  });

  it('normalize throws on zero vector', () => {
    expect(() => normalize([0, 0, 0])).toThrow(/zero vector/);
  });

  it('cosine similarity behaves', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });
});

