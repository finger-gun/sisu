import { afterEach, expect, test, vi } from "vitest";
import { createEmbeddingsClient } from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("createEmbeddingsClient maps ordered batch embeddings", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        data: [
          { embedding: [0.1, 0.2] },
          { embedding: [0.3, 0.4] },
        ],
      }),
  } as any);

  const embeddings = createEmbeddingsClient({
    apiKey: "test-key",
    baseUrl: "https://api.example.com/",
    model: "text-embedding-3-small",
  });

  const vectors = await embeddings.embed(["a", "b"]);
  expect(vectors).toEqual([
    [0.1, 0.2],
    [0.3, 0.4],
  ]);

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.example.com/v1/embeddings");
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer test-key");
  expect(JSON.parse(String(init.body))).toEqual({
    model: "text-embedding-3-small",
    input: ["a", "b"],
  });
});

test("createEmbeddingsClient supports model overrides and custom paths", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }),
  } as any);

  const embeddings = createEmbeddingsClient({
    baseUrl: "https://api.example.com",
    model: "default-model",
    path: "/custom/embed",
    headers: { "x-test": "1" },
  });

  await embeddings.embed(["hello"], { model: "override-model" });
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.example.com/custom/embed");
  const headers = init.headers as Record<string, string>;
  expect(headers["x-test"]).toBe("1");
  expect(JSON.parse(String(init.body)).model).toBe("override-model");
});

test("createEmbeddingsClient propagates provider failures", async () => {
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: false,
    status: 500,
    statusText: "Boom",
    text: async () => JSON.stringify({ error: { message: "provider failed" } }),
  } as any);

  const embeddings = createEmbeddingsClient({
    baseUrl: "https://api.example.com",
    model: "embed-model",
  });

  await expect(embeddings.embed(["x"])).rejects.toThrow(/provider failed/i);
});

test("createEmbeddingsClient rejects invalid JSON", async () => {
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => "not-json",
  } as any);

  const embeddings = createEmbeddingsClient({
    baseUrl: "https://api.example.com",
    model: "embed-model",
  });

  await expect(embeddings.embed(["x"])).rejects.toThrow(
    /Failed to parse embeddings response/i,
  );
});

test("createEmbeddingsClient rejects mismatched embedding counts", async () => {
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
  } as any);

  const embeddings = createEmbeddingsClient({
    baseUrl: "https://api.example.com",
    model: "embed-model",
  });

  await expect(embeddings.embed(["a", "b"])).rejects.toThrow(
    /Expected 2 embeddings, received 1/i,
  );
});

test("createEmbeddingsClient supports cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const embeddings = createEmbeddingsClient({
    baseUrl: "https://api.example.com",
    model: "embed-model",
  });

  await expect(embeddings.embed(["x"], { signal: controller.signal })).rejects
    .toThrow(/aborted/i);
});
