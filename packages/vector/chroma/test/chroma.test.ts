import { beforeEach, describe, expect, test, vi } from "vitest";
import { createChromaVectorStore } from "../src/index.js";

const add = vi.fn(async () => {});
const query = vi.fn(async () => ({
  ids: [["a"]],
  distances: [[0.1]],
  metadatas: [[{ text: "A" }]],
}));
const del = vi.fn(async () => {});
const getOrCreateCollection = vi.fn(async () => ({ add, query, delete: del }));

vi.mock("chromadb", () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({ getOrCreateCollection })),
}));

describe("vector-chroma adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("upsert/query/delete via chroma", async () => {
    const store = createChromaVectorStore({
      namespace: "sisu",
      chromaUrl: "http://localhost:8000",
    });

    const upsert = await store.upsert({
      records: [{ id: "1", embedding: [0.1, 0.2], metadata: { text: "hello" } }],
    });
    const res = await store.query({ embedding: [0.1, 0.2], topK: 1 });
    const removed = await store.delete({ ids: ["1"] });

    expect(upsert.count).toBe(1);
    expect(res.matches[0]?.id).toBe("a");
    expect(removed.count).toBe(1);
  });
});

