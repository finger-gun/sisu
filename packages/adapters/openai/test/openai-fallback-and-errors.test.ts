import { afterEach, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

function coreMock() {
  return {
    firstConfigValue: (keys: string[]) => {
      for (const key of keys) {
        const value = process.env[key];
        if (value) return value;
      }
      return undefined;
    },
    createEmbeddingsClient: undefined,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  hoisted.createMock.mockReset();
  delete (process.env as any).OPENAI_API_KEY;
  delete (process.env as any).API_KEY;
  delete (process.env as any).DEBUG_LLM;
});

async function importOpenAIModule() {
  vi.doMock("@sisu-ai/core", () => coreMock());
  vi.doMock("openai", () => ({
    default: class MockOpenAI {
      chat = {
        completions: {
          create: hoisted.createMock,
        },
      };
    },
  }));
  return await import("../src/index.js");
}

test("openAIEmbeddings fallback handles success and validation errors", async () => {
  const { openAIEmbeddings } = await importOpenAIModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [1, 2] }] }),
  } as any);
  const embeddings = openAIEmbeddings({
    apiKey: "k",
    model: "text-embedding-3-small",
    baseUrl: "https://api.example.com",
  });
  await expect(embeddings.embed(["hello"])).resolves.toEqual([[1, 2]]);
  await expect(embeddings.embed([])).rejects.toThrow(/at least one string/i);
  const ac = new AbortController();
  ac.abort();
  await expect(embeddings.embed(["x"], { signal: ac.signal })).rejects.toThrow(
    /aborted/i,
  );
});

test("openAIEmbeddings fallback maps API and parsing failures", async () => {
  const { openAIEmbeddings } = await importOpenAIModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);
  const embeddings = openAIEmbeddings({
    apiKey: "k",
    model: "text-embedding-3-small",
    baseUrl: "https://api.example.com",
  });

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: "Boom",
    text: async () => JSON.stringify({ error: { message: "provider failed" } }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/provider failed/);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 502,
    statusText: "Bad Gateway",
    text: async () => "upstream is down",
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/upstream is down/);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => "{bad-json",
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/Failed to parse embeddings response/);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [1, 2] }] }),
  } as any);
  await expect(embeddings.embed(["a", "b"])).rejects.toThrow(/Expected 2 embeddings, received 1/);
});

test("openAIAdapter maps structured and non-Error failures", async () => {
  const { openAIAdapter } = await importOpenAIModule();
  process.env.OPENAI_API_KEY = "k";

  hoisted.createMock.mockRejectedValueOnce({
    status: 429,
    name: "RateLimitError",
    message: "too many requests",
  });
  const llm = openAIAdapter({ model: "gpt-5.4" });
  await expect(llm.generate([{ role: "user", content: "hi" } as any])).rejects
    .toThrow(/OpenAI API error: 429 RateLimitError/);

  hoisted.createMock.mockRejectedValueOnce("boom-string");
  await expect(llm.generate([{ role: "user", content: "hi" } as any])).rejects
    .toThrow(/OpenAI API error: boom-string/);
});

test("openAIAdapter debug logging and streaming error paths are exercised", async () => {
  const { openAIAdapter } = await importOpenAIModule();
  process.env.OPENAI_API_KEY = "k";
  process.env.DEBUG_LLM = "1";
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  hoisted.createMock.mockResolvedValueOnce({
    choices: [{ message: { role: "assistant", content: "ok" } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const llm = openAIAdapter({ model: "gpt-5.4", responseModel: "gpt-4.1" }) as any;
  expect(llm.meta.responseModel).toBe("gpt-4.1");
  await llm.generate([
    {
      role: "assistant",
      content: "x".repeat(600),
      tool_calls: [{ id: "t1", name: "echo", arguments: { ok: true } }],
    } as any,
  ], {
    tools: [{ name: "echo", description: "echo", schema: {} as any, handler: async () => null }],
    toolChoice: { name: "echo" } as any,
    parallelToolCalls: true,
  });

  expect(errSpy.mock.calls.some((call) => String(call[0]).includes("[DEBUG_LLM] request"))).toBe(true);

  hoisted.createMock.mockRejectedValueOnce({
    status: 500,
    name: "ServerError",
    message: "stream failed",
  });
  const iter = llm.generate([{ role: "user", content: "stream" } as any], { stream: true }) as AsyncIterable<any>;
  await expect((async () => {
    for await (const _ of iter) {
      // no-op
    }
  })()).rejects.toThrow(/OpenAI API error: 500 ServerError/);
});

test("openAIAdapter handles tool-role mapping and unsupported toolChoice shapes", async () => {
  const { openAIAdapter } = await importOpenAIModule();
  process.env.OPENAI_API_KEY = "k";

  hoisted.createMock.mockImplementationOnce(async (body: any) => {
    expect(body.tool_choice).toBeUndefined();
    expect(body.messages[0]).toEqual({
      role: "tool",
      content: "42",
      name: "runner",
    });
    return { choices: [{ message: { role: "assistant", content: "ok" } }] };
  });

  const llm = openAIAdapter({ model: "gpt-5.4" });
  await llm.generate(
    [{ role: "tool", content: 42 as any, name: "runner" } as any],
    {
      tools: [{ name: "echo", description: "echo", schema: {} as any, handler: async () => null }],
      toolChoice: {} as any,
    },
  );
});

test("openAIAdapter covers stable id fallback, circular args, and error mapping variants", async () => {
  const { openAIAdapter } = await importOpenAIModule();
  process.env.OPENAI_API_KEY = "k";
  const llm = openAIAdapter({ model: "gpt-5.4" });

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  hoisted.createMock.mockResolvedValueOnce({
    choices: [
      {
        message: {
          role: "assistant",
          content: "",
          function_call: { name: "fc", arguments: circular },
        },
      },
    ],
  });
  const out = await llm.generate([{ role: "user", content: "x" } as any]);
  const tcs = (out.message as any).tool_calls;
  expect(String(tcs[0].id)).toContain("fc_fc_");

  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  hoisted.createMock.mockRejectedValueOnce(abortErr);
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects.toThrow(
    /aborted/i,
  );

  hoisted.createMock.mockRejectedValueOnce(new Error("plain error"));
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects.toThrow(
    /plain error/,
  );

  hoisted.createMock.mockRejectedValueOnce({ status: 500, name: "ServerError" });
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects.toThrow(
    /Unknown error from OpenAI SDK/,
  );
});

test("openAIEmbeddings fallback maps generic message and unknown error bodies", async () => {
  const { openAIEmbeddings } = await importOpenAIModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);
  const embeddings = openAIEmbeddings({
    apiKey: "k",
    model: "text-embedding-3-small",
    baseUrl: "https://api.example.com",
  });

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 400,
    statusText: "Bad",
    text: async () => JSON.stringify({ message: "plain-message" }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/plain-message/);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 400,
    statusText: "Bad",
    text: async () => JSON.stringify({ code: "X" }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/\{"code":"X"\}/);
});
