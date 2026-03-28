import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createVectraVectorStore } from "../src/index.js";

const tempDirs: string[] = [];

async function makeStore() {
  const folderPath = await fs.mkdtemp(path.join(os.tmpdir(), "sisu-vectra-"));
  tempDirs.push(folderPath);
  return {
    folderPath,
    store: createVectraVectorStore({
      folderPath,
      indexedMetadataFields: ["category", "source"],
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((folderPath) =>
      fs.rm(folderPath, { recursive: true, force: true }),
    ),
  );
});

describe("vector-vectra", () => {
  test("upserts and queries records", async () => {
    const { store } = await makeStore();

    await store.upsert({
      namespace: "travel",
      records: [
        {
          id: "doc-1",
          embedding: [1, 0],
          metadata: { text: "Malmö fika", category: "city", source: "seed" },
        },
        {
          id: "doc-2",
          embedding: [0, 1],
          metadata: { text: "Helsinki sauna", category: "city", source: "seed" },
        },
      ],
    });

    const result = await store.query({
      namespace: "travel",
      embedding: [1, 0],
      topK: 1,
      filter: { category: { $eq: "city" } },
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.id).toBe("doc-1");
    expect(result.matches[0]?.metadata?.text).toBe("Malmö fika");
  });

  test("isolates namespaces by folder", async () => {
    const { store, folderPath } = await makeStore();

    await store.upsert({
      namespace: "a",
      records: [{ id: "one", embedding: [1, 0], metadata: { text: "A" } }],
    });
    await store.upsert({
      namespace: "b",
      records: [{ id: "two", embedding: [1, 0], metadata: { text: "B" } }],
    });

    const namespaceEntries = await fs.readdir(folderPath);
    expect(namespaceEntries).toEqual(expect.arrayContaining(["a", "b"]));

    const resultA = await store.query({ namespace: "a", embedding: [1, 0], topK: 5 });
    const resultB = await store.query({ namespace: "b", embedding: [1, 0], topK: 5 });

    expect(resultA.matches.map((match) => match.id)).toEqual(["one"]);
    expect(resultB.matches.map((match) => match.id)).toEqual(["two"]);
  });

  test("returns empty matches for missing namespace", async () => {
    const { store } = await makeStore();

    const result = await store.query({
      namespace: "missing",
      embedding: [1, 0],
      topK: 3,
    });

    expect(result.matches).toEqual([]);
  });

  test("deletes records", async () => {
    const { store } = await makeStore();

    await store.upsert({
      namespace: "travel",
      records: [
        { id: "doc-1", embedding: [1, 0], metadata: { text: "Malmö fika" } },
      ],
    });
    await store.delete?.({ namespace: "travel", ids: ["doc-1"] });

    const result = await store.query({ namespace: "travel", embedding: [1, 0], topK: 3 });
    expect(result.matches).toEqual([]);
  });

  test("serializes concurrent writes in the same namespace", async () => {
    const { store } = await makeStore();

    await Promise.all([
      store.upsert({
        namespace: "travel",
        records: [{ id: "doc-1", embedding: [1, 0], metadata: { text: "A" } }],
      }),
      store.upsert({
        namespace: "travel",
        records: [{ id: "doc-2", embedding: [0, 1], metadata: { text: "B" } }],
      }),
      store.upsert({
        namespace: "travel",
        records: [{ id: "doc-3", embedding: [1, 1], metadata: { text: "C" } }],
      }),
    ]);

    const result = await store.query({ namespace: "travel", embedding: [1, 0], topK: 10 });
    expect(result.matches.map((match) => match.id).sort()).toEqual([
      "doc-1",
      "doc-2",
      "doc-3",
    ]);
  });
});
