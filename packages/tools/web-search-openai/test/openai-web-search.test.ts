import { test, expect, vi, afterEach } from "vitest";
import { openAIWebSearch } from "../src/index.js";
import type { ToolContext } from "@sisu-ai/core";

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OPENAI_API_KEY;
  delete (process.env as any).API_KEY;
  delete (process.env as any).OPENAI_RESPONSES_BASE_URL;
  delete (process.env as any).OPENAI_BASE_URL;
  delete (process.env as any).BASE_URL;
  delete (process.env as any).OPENAI_MODEL;
  delete (process.env as any).OPENAI_RESPONSES_MODEL;
});

const makeCtx = (deps?: Record<string, unknown>): ToolContext =>
  ({
    model: { name: "openai:gpt-4o-mini" },
    log: { info: vi.fn(), debug: vi.fn() },
    signal: new AbortController().signal,
    memory: { get: vi.fn(), set: vi.fn() },
    deps,
  }) as unknown as ToolContext;

test("openAIWebSearch posts to /v1/responses with web_search tool and returns results", async () => {
  process.env.OPENAI_API_KEY = "k";
  process.env.OPENAI_RESPONSES_BASE_URL = "https://api.example.com";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url, init) => {
      const req = JSON.parse((init as any).body);
      expect(String(url)).toBe("https://api.example.com/v1/responses");
      expect(req.tools?.[0]?.type).toBe("web_search");
      expect(req.tool_choice?.type).toBe("web_search");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify({
            output: [
              {
                type: "web_search_results",
                web_search_results: [{ title: "A", url: "http://a" }],
              },
            ],
          }),
      } as any;
    });

  const results: unknown = await openAIWebSearch.handler(
    { query: "hello" } as never,
    makeCtx(),
  );
  expect(Array.isArray(results)).toBe(true);
  const arr = results as Array<{ title?: string }>;
  expect(arr[0]?.title).toBe("A");
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("openAIWebSearch throws on non-JSON response", async () => {
  process.env.OPENAI_API_KEY = "k";
  process.env.OPENAI_RESPONSES_BASE_URL = "https://api.example.com";
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    text: async () => "<html>",
  } as any);
  await expect(
    openAIWebSearch.handler({ query: "x" } as never, makeCtx()),
  ).rejects.toThrow(/non-JSON content/);
});

test("openAIWebSearch throws when API key is missing", async () => {
  await expect(
    openAIWebSearch.handler({ query: "x" } as never, makeCtx()),
  ).rejects.toThrow(/Missing OPENAI_API_KEY/);
});

test("openAIWebSearch retries with fallback model on tool mismatch", async () => {
  process.env.OPENAI_API_KEY = "k";
  process.env.OPENAI_RESPONSES_BASE_URL = "https://api.example.com";
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch" as any).mockImplementation(async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse((init as any).body) });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: { get: () => "application/json" },
        text: async () =>
          JSON.stringify({ error: { message: "tool mismatch" } }),
      } as any;
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          output: [{ type: "web_search_results", web_search_results: [] }],
        }),
    } as any;
  });

  const ctx = makeCtx();
  ctx.model = { name: "openai:bad-model" } as any;
  await openAIWebSearch.handler({ query: "q" } as never, ctx);
  expect(calls.length).toBe(2);
  expect(calls[0]?.url).toBe("https://api.example.com/v1/responses");
  const body1 = calls[0]?.body as { model?: string };
  const body2 = calls[1]?.body as { model?: string };
  expect(body1.model).toBe("bad-model");
  expect(body2.model).toBe("gpt-4.1-mini");
});

test("openAIWebSearch reads results from content array", async () => {
  process.env.OPENAI_API_KEY = "k";
  process.env.OPENAI_RESPONSES_BASE_URL = "https://api.example.com";
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: async () =>
      JSON.stringify({
        output: [
          {
            content: [
              {
                type: "web_search_results",
                web_search_results: [{ title: "B", url: "http://b" }],
              },
            ],
          },
        ],
      }),
  } as any);

  const out = await openAIWebSearch.handler(
    { query: "hello" } as never,
    makeCtx(),
  );
  const arr = out as Array<{ title?: string }>;
  expect(arr[0]?.title).toBe("B");
});
