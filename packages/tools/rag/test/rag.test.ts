import { describe, test, expect, vi } from "vitest";
import type { ToolContext } from "@sisu-ai/core";
import {
  createRetrieveTool,
  createStoreTool,
  createRagTools,
  type EmbeddingsProvider,
} from "../src/index.js";
import type { VectorStore } from "@sisu-ai/vector-core";

function makeCtx(overrides?: { deps?: Record<string, unknown> }): ToolContext {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    signal: new AbortController().signal,
    memory: { get: vi.fn(), set: vi.fn() },
    model: { name: "m", capabilities: {}, generate: vi.fn() } as never,
    deps: overrides?.deps,
  };
}

describe("tool-rag", () => {
  test("retrieve tool uses vector store contract", async () => {
    const embeddings: EmbeddingsProvider = { embed: vi.fn(async () => [[0.1, 0.2]]) };
    const vectorStore: VectorStore = {
      upsert: vi.fn(async () => ({ count: 0 })),
      query: vi.fn(async () => ({
        matches: [{ id: "d1", score: 0.1, metadata: { text: "hello", source: "seed" } }],
      })),
    };
    const tool = createRetrieveTool({ embeddings, vectorStore, defaultTopK: 2 });
    const out = await tool.handler({ queryText: "hello" }, makeCtx());
    expect(out.total).toBe(1);
    expect(out.items[0]?.text).toBe("hello");
  });

  test("store tool chunks, embeds, and upserts", async () => {
    const embeddings: EmbeddingsProvider = {
      embed: vi.fn(async (chunks) => chunks.map(() => [0.4, 0.6])),
    };
    const vectorStore: VectorStore = {
      upsert: vi.fn(async (input) => ({ count: input.records.length })),
      query: vi.fn(async () => ({ matches: [] })),
    };
    const tool = createStoreTool({
      embeddings,
      vectorStore,
      chunkingStrategy: "sentences",
      chunkSize: 20,
      maxChunks: 3,
    });
    const out = await tool.handler(
      { content: "One sentence. Two sentence. Three sentence." },
      makeCtx(),
    );
    expect(out.stored).toBeGreaterThan(0);
    expect(vectorStore.upsert).toHaveBeenCalledTimes(1);
  });

  test("supports custom chunker", async () => {
    const chunker = vi.fn(() => ["all"]);
    const tool = createStoreTool({
      embeddings: { embed: vi.fn(async () => [[1, 2]]) },
      vectorStore: {
        upsert: vi.fn(async () => ({ count: 1 })),
        query: vi.fn(async () => ({ matches: [] })),
      },
      chunker,
    });
    await tool.handler({ content: "abc" }, makeCtx());
    expect(chunker).toHaveBeenCalledTimes(1);
  });

  test("exports rag tools bundle", () => {
    const tools = createRagTools({
      embeddings: { embed: vi.fn(async () => [[0.1]]) },
      vectorStore: {
        upsert: vi.fn(async () => ({ count: 0 })),
        query: vi.fn(async () => ({ matches: [] })),
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["retrieveContext", "storeContext"]);
  });
});
