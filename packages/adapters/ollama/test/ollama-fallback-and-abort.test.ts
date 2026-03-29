import { afterEach, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  chatMock: vi.fn(),
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
  hoisted.chatMock.mockReset();
  delete (process.env as any).BASE_URL;
  delete (process.env as any).OLLAMA_BASE_URL;
});

async function importOllamaModule() {
  vi.doMock("@sisu-ai/core", () => coreMock());
  vi.doMock("ollama", () => ({
    Ollama: class MockOllama {
      chat = hoisted.chatMock;
    },
  }));
  return await import("../src/index.js");
}

test("ollamaEmbeddings fallback validates input and parses failures", async () => {
  const { ollamaEmbeddings } = await importOllamaModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);
  const embeddings = ollamaEmbeddings({ model: "embeddinggemma", baseUrl: "http://localhost:11434" });

  await expect(embeddings.embed([])).rejects.toThrow(/at least one string/);
  const ac = new AbortController();
  ac.abort();
  await expect(embeddings.embed(["x"], { signal: ac.signal })).rejects.toThrow(/aborted/);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: "Boom",
    text: async () => "upstream",
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/upstream/);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => "{bad",
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/Failed to parse embeddings response/);
});

test("ollamaAdapter maps errors and handles aborted signal in non-stream mode", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  const llm = ollamaAdapter({ model: "llama3" });

  hoisted.chatMock.mockRejectedValueOnce(new Error("backend failed"));
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects.toThrow(
    /Ollama API error: backend failed/,
  );

  hoisted.chatMock.mockRejectedValueOnce("boom");
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects.toThrow(
    /Ollama API error: boom/,
  );

  const ac = new AbortController();
  ac.abort();
  await expect(
    llm.generate([{ role: "user", content: "x" } as any], { signal: ac.signal }),
  ).rejects.toThrow(/aborted/i);
});

test("ollamaAdapter stream mode emits mapped error and respects abort checks", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  const llm = ollamaAdapter({ model: "llama3" });

  hoisted.chatMock.mockResolvedValueOnce((async function* () {
    yield { message: { content: "a" } };
    yield { done: true };
  })());
  const ac = new AbortController();
  ac.abort();
  const stream = llm.generate([{ role: "user", content: "x" } as any], {
    stream: true,
    signal: ac.signal,
  }) as AsyncIterable<any>;
  await expect((async () => {
    for await (const _ of stream) {
      // no-op
    }
  })()).rejects.toThrow(/aborted/i);
});

test("ollamaAdapter tool filtering and argument normalization branches", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  hoisted.chatMock.mockResolvedValue({
    message: {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "ok", function: { name: "sum", arguments: '{"x":1}' } },
        { id: "", function: { name: "bad", arguments: '{"x":2}' } },
      ],
    },
  });

  const llm = ollamaAdapter({ model: "llama3" });
  const out = await llm.generate([{ role: "user", content: "x" } as any], {
    tools: [
      { name: "sum", description: "sum", schema: {} as any, handler: async () => null },
      { name: "echo", description: "echo", schema: {} as any, handler: async () => null },
    ],
    toolChoice: { name: "sum" } as any,
  });

  expect((out.message as any).tool_calls).toEqual([
    { id: "ok", name: "sum", arguments: { x: 1 } },
  ]);
});

test("ollamaEmbeddings fallback covers model/base validation and parse shapes", async () => {
  const { ollamaEmbeddings } = await importOllamaModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);

  expect(() => ollamaEmbeddings({ model: "" as any })).toThrow(/model is required/i);

  const embeddings = ollamaEmbeddings({
    model: "embeddinggemma",
    baseUrl: "http://localhost:11434",
  });

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ embeddings: [[1, 2]] }),
  } as any);
  await expect(embeddings.embed(["x"])).resolves.toEqual([[1, 2]]);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: "Boom",
    text: async () => JSON.stringify({ message: "fail" }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/fail/);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ embeddings: [[1, 2]] }),
  } as any);
  await expect(embeddings.embed(["a", "b"])).rejects.toThrow(/Expected 2 embeddings, received 1/);
});

test("ollamaAdapter covers tool choice none, schema branches, and image aliases", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  hoisted.chatMock.mockResolvedValue({ message: { role: "assistant", content: "ok" } });
  const llm = ollamaAdapter({ model: "llama3" });
  const { z } = await import("zod");

  await llm.generate(
    [
      {
        role: "user",
        contentParts: [
          { type: "text", text: "hello" },
          { type: "image", url: "data:image/png;base64,AQID" },
          { image_url: "data:image/png;base64,BAUG" },
          { image: "data:image/png;base64,BwgJ" },
        ],
      } as any,
    ],
    {
      tools: [
        {
          name: "complex",
          description: "complex",
          schema: z.object({
            a: z.string(),
            arr: z.array(z.number()),
            o: z.object({ k: z.string().optional() }),
          }),
          handler: async () => null,
        },
      ],
      toolChoice: "none",
    },
  );

  const req = hoisted.chatMock.mock.calls[0]?.[0];
  expect(req.tools).toBeUndefined();
  expect(req.messages[0].images).toEqual(["AQID", "BAUG", "BwgJ"]);
});

test("ollamaAdapter covers non-array tool calls and streaming abort passthrough", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  const llm = ollamaAdapter({ model: "llama3" });

  hoisted.chatMock.mockResolvedValueOnce({
    message: { role: "assistant", content: 123, tool_calls: { bad: true } },
  });
  const out = await llm.generate([{ role: "user", content: "x" } as any]);
  expect(out.message.content).toBe("");
  expect((out.message as any).tool_calls).toBeUndefined();

  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  hoisted.chatMock.mockRejectedValueOnce(abortErr);
  const stream = llm.generate([{ role: "user", content: "x" } as any], { stream: true }) as AsyncIterable<any>;
  await expect((async () => {
    for await (const _ of stream) {
      // no-op
    }
  })()).rejects.toThrow(/aborted/i);
});

test("ollamaAdapter covers tool arg fallback, safeJson passthrough and zod schema defaults", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  const { z } = await import("zod");

  hoisted.chatMock.mockResolvedValueOnce({
    message: {
      role: "assistant",
      content: "ok",
      tool_calls: [{ id: "t1", function: { name: "echo", arguments: { x: 1 } } }],
    },
  });

  const llm = ollamaAdapter({ model: "llama3" });
  const out = await llm.generate(
    [
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "a1", name: "echo", arguments: "not-object" }],
      } as any,
    ],
    {
      tools: [
        {
          name: "echo",
          description: "echo",
          schema: z.object({
            opt: z.string().optional(),
            def: z.string().default("x"),
          }),
          handler: async () => null,
        },
      ],
      toolChoice: { id: 1 } as any,
    },
  );

  const req = hoisted.chatMock.mock.calls[0]?.[0];
  expect(req.tools[0].function.parameters.type).toBe("object");
  expect(req.messages[0].tool_calls[0].function.arguments).toEqual({});
  expect((out.message as any).tool_calls[0].arguments).toEqual({ x: 1 });
});

test("ollamaAdapter covers stream completion without done marker and early abort via mock", async () => {
  const { ollamaAdapter } = await importOllamaModule();
  const llm = ollamaAdapter({ model: "llama3" });

  hoisted.chatMock.mockResolvedValueOnce(
    (async function* () {
      yield { message: { content: "a" } };
      yield { message: { content: "b" } };
    })(),
  );
  const events: any[] = [];
  const stream = llm.generate([{ role: "user", content: "x" } as any], {
    stream: true,
  }) as AsyncIterable<any>;
  for await (const ev of stream) events.push(ev);
  expect(events.some((e) => e.type === "assistant_message")).toBe(false);

  hoisted.chatMock.mockImplementationOnce(async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });
  const badStream = llm.generate([{ role: "user", content: "x" } as any], {
    stream: true,
    signal: new AbortController().signal,
  }) as AsyncIterable<any>;
  await expect((async () => {
    for await (const _ of badStream) {
      // no-op
    }
  })()).rejects.toThrow(/aborted/i);
});
