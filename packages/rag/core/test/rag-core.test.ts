import { describe, expect, test, vi } from "vitest";
import {
  paragraphChunker,
  prepareRagRecords,
  retrieveRagContext,
  sentenceChunker,
  storeRagContent,
  type EmbeddingsProvider,
} from "../src/index.js";
import type { VectorStore } from "@sisu-ai/vector-core";

describe("rag-core", () => {
  test("prepareRagRecords chunks and shapes records", async () => {
    const embeddings: EmbeddingsProvider = {
      embed: vi.fn(async (chunks) => chunks.map(() => [0.4, 0.6])),
    };

    const out = await prepareRagRecords({
      content: "One sentence. Two sentence. Three sentence.",
      chunkingStrategy: "sentences",
      chunkSize: 20,
      maxChunks: 3,
      idPrefix: "doc1",
      source: "seed",
      embeddings,
    });

    expect(out.records.length).toBeGreaterThan(0);
    expect(out.records[0]?.id.startsWith("doc1_")).toBe(true);
    expect(out.records[0]?.metadata?.source).toBe("seed");
  });

  test("storeRagContent upserts prepared records", async () => {
    const vectorStore: VectorStore = {
      upsert: vi.fn(async (input) => ({ count: input.records.length })),
      query: vi.fn(async () => ({ matches: [] })),
    };

    const out = await storeRagContent({
      content: "abc",
      embeddings: { embed: vi.fn(async () => [[1, 2]]) },
      vectorStore,
      chunker: () => ["all"],
    });

    expect(out.stored).toBe(1);
    expect(vectorStore.upsert).toHaveBeenCalledTimes(1);
  });

  test("retrieveRagContext returns citation-ready results", async () => {
    const vectorStore: VectorStore = {
      upsert: vi.fn(async () => ({ count: 0 })),
      query: vi.fn(async () => ({
        matches: [{ id: "d1", score: 0.1, metadata: { text: "hello", source: "seed" } }],
      })),
    };

    const out = await retrieveRagContext({
      queryText: "hello",
      embeddings: { embed: vi.fn(async () => [[0.1, 0.2]]) },
      vectorStore,
      defaultTopK: 2,
    });

    expect(out.total).toBe(1);
    expect(out.items[0]?.citation.source).toBe("seed");
  });

  test("chunkers return bounded chunks", () => {
    const sentences = sentenceChunker({
      content: "A. B. C.",
      chunkSize: 4,
      maxChunks: 2,
      overlap: 0,
    });
    const paragraphs = paragraphChunker({
      content: "One\n\nTwo\n\nThree",
      chunkSize: 8,
      maxChunks: 2,
      overlap: 0,
    });
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(paragraphs.length).toBeLessThanOrEqual(2);
  });
});
