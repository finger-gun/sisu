import { describe, test, expect, vi, beforeEach } from "vitest";
import type { EmbeddingsProvider, ToolContext } from "@sisu-ai/core";

const add = vi.fn(async () => {});
const query = vi.fn(async () => ({
  ids: [["a", "b"]],
  distances: [[0.1, 0.2]],
  metadatas: [[
    { text: "A", source: "seed", chunkIndex: 0 },
    { text: "B", source: "seed", chunkIndex: 1 },
  ]],
}));
const del = vi.fn(async () => {});
const getOrCreateCollection = vi.fn(async () => ({ add, query, delete: del }));

vi.mock("chromadb", () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({ getOrCreateCollection })),
}));

import {
  vectorUpsert,
  vectorQuery,
  vectorDelete,
  createRetrieveTool,
  createStoreTool,
  createRagContextTools,
} from "../src/index.js";

function makeBaseCtx(overrides?: {
  signal?: globalThis.AbortSignal;
  deps?: Record<string, unknown>;
}): ToolContext {
  return {
    log: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    signal: overrides?.signal ?? new AbortController().signal,
    memory: { get: vi.fn(), set: vi.fn() },
    model: { name: "m", capabilities: {}, generate: vi.fn() } as never,
    deps: overrides?.deps,
  };
}

describe("vec-chroma tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("upsert sends ids, embeddings, metadatas", async () => {
    const res = await vectorUpsert.handler(
      {
        records: [
          { id: "1", embedding: [0.1, 0.2, 0.3], metadata: { text: "T1" } },
          { id: "2", embedding: [0.4, 0.5, 0.6] },
        ],
      },
      makeBaseCtx(),
    );
    expect(res.count).toBe(2);
    expect(add).toHaveBeenCalledTimes(1);
  });

  test("query returns matches with id, score, metadata", async () => {
    const out = await vectorQuery.handler(
      { embedding: [0, 1], topK: 2 },
      makeBaseCtx(),
    );
    expect(out.matches.length).toBe(2);
    expect(out.matches[0]?.id).toBe("a");
    expect(out.matches[0]?.metadata?.text).toBe("A");
  });

  test("delete accepts ids", async () => {
    const res = await vectorDelete.handler(
      { ids: ["1", "2"] },
      makeBaseCtx(),
    );
    expect(res.count).toBe(2);
    expect(del).toHaveBeenCalledTimes(1);
  });

  test("retrieveContext embeds query and returns compact citation output", async () => {
    const embeddings: EmbeddingsProvider = {
      embed: vi.fn(async () => [[0.3, 0.4]]),
    };
    const tool = createRetrieveTool({ embeddings, defaultTopK: 2 });
    const out = await tool.handler(
      {
        queryText: "malmo fika",
      },
      makeBaseCtx(),
    );
    expect(embeddings.embed).toHaveBeenCalledWith(["malmo fika"], {
      signal: expect.any(Object),
    });
    expect(out.total).toBe(2);
    expect(out.items[0]?.citation.source).toBe("seed");
    expect(out.items[0]?.text).toBe("A");
  });

  test("retrieveContext rejects invalid schema input", () => {
    const tool = createRetrieveTool({
      embeddings: { embed: vi.fn(async () => [[0.1]]) },
    });
    expect(() => tool.schema.parse({ queryText: "" })).toThrow();
  });

  test("retrieveContext propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const tool = createRetrieveTool({
      embeddings: { embed: vi.fn(async () => [[0.1]]) },
    });
    await expect(
      tool.handler({ queryText: "x" }, makeBaseCtx({ signal: controller.signal })),
    ).rejects.toThrow(/aborted/i);
  });

  test("retrieveContext propagates embedding errors", async () => {
    const tool = createRetrieveTool({
      embeddings: {
        embed: vi.fn(async () => {
          throw new Error("embedding failed");
        }),
      },
    });
    await expect(tool.handler({ queryText: "x" }, makeBaseCtx())).rejects.toThrow(
      /embedding failed/i,
    );
  });

  test("storeContext chunks, embeds, and upserts bounded data", async () => {
    const embeddings: EmbeddingsProvider = {
      embed: vi.fn(async (input) => input.map(() => [0.2, 0.8])),
    };
    const tool = createStoreTool({
      embeddings,
      chunkSize: 10,
      maxChunks: 2,
    });
    const out = await tool.handler(
      {
        content: "1234567890abcdefghijZZZZ",
        source: "user",
      },
      makeBaseCtx(),
    );
    expect(embeddings.embed).toHaveBeenCalledTimes(1);
    expect(out.stored).toBe(2);
    expect(out.totalChunks).toBe(2);
    expect(out.truncated).toBe(true);
    expect(out.ids.length).toBe(2);
  });

  test("storeContext rejects invalid schema input", () => {
    const tool = createStoreTool({
      embeddings: { embed: vi.fn(async () => [[0.1]]) },
    });
    expect(() => tool.schema.parse({ content: "" })).toThrow();
  });

  test("storeContext uses deps.embeddings when options embeddings missing", async () => {
    const embeddings: EmbeddingsProvider = {
      embed: vi.fn(async () => [[0.1]]),
    };
    const tool = createStoreTool({ chunkSize: 100, maxChunks: 1 });
    const out = await tool.handler(
      { content: "hello world" },
      makeBaseCtx({ deps: { embeddings } }),
    );
    expect(out.stored).toBe(1);
    expect(embeddings.embed).toHaveBeenCalledTimes(1);
  });

  test("storeContext propagates embedding errors", async () => {
    const tool = createStoreTool({
      embeddings: {
        embed: vi.fn(async () => {
          throw new Error("embed boom");
        }),
      },
    });
    await expect(tool.handler({ content: "abc" }, makeBaseCtx())).rejects.toThrow(
      /embed boom/i,
    );
  });

  test("createRagContextTools returns retrieve+store by default", () => {
    const tools = createRagContextTools({
      embeddings: { embed: vi.fn(async () => [[0.1]]) },
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "retrieveContext",
      "storeContext",
    ]);
  });

  test("createRagContextTools can include upsert when explicitly enabled", () => {
    const tools = createRagContextTools({
      embeddings: { embed: vi.fn(async () => [[0.1]]) },
      includeUpsert: true,
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "vector.upsert",
      "retrieveContext",
      "storeContext",
    ]);
  });

  test("retrieveContext honors fixed namespace option", async () => {
    const tool = createRetrieveTool({
      namespace: "fixed-ns",
      embeddings: { embed: vi.fn(async () => [[0.1, 0.9]]) },
    });
    await tool.handler(
      {
        queryText: "test",
        namespace: "model-provided-ns",
      },
      makeBaseCtx(),
    );
    expect(getOrCreateCollection).toHaveBeenCalledWith({ name: "fixed-ns" });
  });
});
