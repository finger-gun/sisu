import { describe, expect, test, vi } from "vitest";
import {
  vectorDelete,
  vectorQuery,
  vectorUpsert,
} from "../src/index.js";

const { createChromaVectorStoreMock } = vi.hoisted(() => ({
  createChromaVectorStoreMock: vi.fn(),
}));

vi.mock("@sisu-ai/vector-chroma", () => ({
  createChromaVectorStore: createChromaVectorStoreMock,
}));

describe("tool-vec-chroma primitives", () => {
  test("uses injected vector store from ctx.deps", async () => {
    const upsert = vi.fn(async () => ({ count: 1 }));
    const query = vi.fn(async () => ({ matches: [] }));
    const del = vi.fn(async () => ({ count: 1 }));
    const ctx = {
      signal: new AbortController().signal,
      deps: {
        vectorStore: { upsert, query, delete: del },
      },
    } as any;

    await vectorUpsert.handler(
      { records: [{ id: "1", embedding: [0.1], metadata: { text: "hello" } }] },
      ctx,
    );
    await vectorQuery.handler({ embedding: [0.1], topK: 2 }, ctx);
    await vectorDelete.handler({ ids: ["1"] }, ctx);

    expect(upsert).toHaveBeenCalledWith({
      records: [{ id: "1", embedding: [0.1], metadata: { text: "hello" } }],
      namespace: "sisu",
      signal: ctx.signal,
    });
    expect(query).toHaveBeenCalledWith({
      embedding: [0.1],
      topK: 2,
      filter: undefined,
      namespace: "sisu",
      signal: ctx.signal,
    });
    expect(del).toHaveBeenCalledWith({
      ids: ["1"],
      namespace: "sisu",
      signal: ctx.signal,
    });
  });

  test("falls back to chroma adapter and honors explicit namespace", async () => {
    const upsert = vi.fn(async () => ({ count: 1 }));
    const query = vi.fn(async () => ({ matches: [] }));
    const del = vi.fn(async () => ({ count: 1 }));
    createChromaVectorStoreMock.mockReturnValue({ upsert, query, delete: del });

    const ctx = {
      signal: new AbortController().signal,
      deps: {
        chromaUrl: "http://localhost:8000",
        vectorNamespace: "docs",
      },
    } as any;

    await vectorUpsert.handler(
      {
        records: [{ id: "1", embedding: [0.1], metadata: { text: "hello" } }],
        namespace: "manual",
      },
      ctx,
    );
    await vectorQuery.handler(
      { embedding: [0.1], topK: 1, namespace: "manual" },
      ctx,
    );
    await vectorDelete.handler({ ids: ["1"], namespace: "manual" }, ctx);

    expect(createChromaVectorStoreMock).toHaveBeenCalledWith({
      chromaUrl: "http://localhost:8000",
      namespace: "docs",
    });
    expect(upsert).toHaveBeenCalledWith({
      records: [{ id: "1", embedding: [0.1], metadata: { text: "hello" } }],
      namespace: "manual",
      signal: ctx.signal,
    });
    expect(query).toHaveBeenCalledWith({
      embedding: [0.1],
      topK: 1,
      filter: undefined,
      namespace: "manual",
      signal: ctx.signal,
    });
    expect(del).toHaveBeenCalledWith({
      ids: ["1"],
      namespace: "manual",
      signal: ctx.signal,
    });
  });

  test("throws when delete is not implemented", async () => {
    const ctx = {
      signal: new AbortController().signal,
      deps: {
        vectorStore: {
          upsert: vi.fn(async () => ({ count: 1 })),
          query: vi.fn(async () => ({ matches: [] })),
        },
      },
    } as any;

    await expect(vectorDelete.handler({ ids: ["1"] }, ctx)).rejects.toThrow(
      "Configured vector store does not implement delete",
    );
  });
});
