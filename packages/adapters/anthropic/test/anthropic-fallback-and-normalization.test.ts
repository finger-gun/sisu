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
  delete (process.env as any).ANTHROPIC_API_KEY;
  delete (process.env as any).API_KEY;
});

async function importAnthropicModule() {
  vi.doMock("@sisu-ai/core", () => coreMock());
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
      messages = {
        create: hoisted.createMock,
      };
    },
  }));
  return await import("../src/index.js");
}

test("anthropicEmbeddings fallback handles success, API errors and parse errors", async () => {
  const { anthropicEmbeddings } = await importAnthropicModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);
  const embeddings = anthropicEmbeddings({
    apiKey: "k",
    baseUrl: "https://api.example.com",
    model: "voyage-3.5",
  });

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [1, 2] }] }),
  } as any);
  await expect(embeddings.embed(["x"])).resolves.toEqual([[1, 2]]);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: "Boom",
    text: async () => JSON.stringify({ error: "provider failed" }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/provider failed/);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => "{bad",
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/Failed to parse embeddings response/);
});

test("anthropicAdapter maps common request validation and content parsing failures", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  process.env.ANTHROPIC_API_KEY = "k";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  await expect(llm.generate([{ role: "system", content: "only-system" } as any])).rejects
    .toThrow(/No valid user\/assistant messages found/);

  hoisted.createMock.mockResolvedValueOnce(null as any);
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects
    .toThrow(/Invalid Anthropic API response: not an object/);

  hoisted.createMock.mockResolvedValueOnce({ content: "bad" } as any);
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects
    .toThrow(/missing or invalid content array/);
});

test("anthropicAdapter exercises mapAnthropicError and tool schema branches", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  process.env.ANTHROPIC_API_KEY = "k";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  hoisted.createMock.mockRejectedValueOnce({
    status: 429,
    name: "RateLimitError",
    message: "too many requests",
  });
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects
    .toThrow(/Anthropic API error: 429 RateLimitError/);

  hoisted.createMock.mockRejectedValueOnce("boom");
  await expect(llm.generate([{ role: "user", content: "x" } as any])).rejects
    .toThrow(/Anthropic API error: boom/);

  hoisted.createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] } as any);
  await expect(
    llm.generate([{ role: "user", content: "x" } as any], {
      tools: [{ name: "", description: "bad", schema: {} as any, handler: async () => null }],
      toolChoice: "none",
    }),
  ).rejects.toThrow(/Tool must have a name/);
});

test("anthropicAdapter covers image and content normalization edge cases", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  process.env.ANTHROPIC_API_KEY = "k";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  hoisted.createMock.mockResolvedValue({ content: [{ type: "text", text: "ok" }] } as any);

  await expect(
    llm.generate([{
      role: "user",
      content: [{ type: "text", text: 123 }],
    } as any]),
  ).rejects.toThrow(/Invalid text content part/);

  await expect(
    llm.generate([{
      role: "user",
      content: [{ type: "image", source: { type: "http", media_type: "image/png", data: "x" } }],
    } as any]),
  ).rejects.toThrow(/Unsupported image source type/);

  await expect(
    llm.generate([{
      role: "user",
      content: [{ type: "image", source: { type: "base64", media_type: "text/plain", data: "x" } }],
    } as any]),
  ).rejects.toThrow(/media_type/);

  await expect(
    llm.generate([{
      role: "user",
      content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "" } }],
    } as any]),
  ).rejects.toThrow(/non-empty base64 string/);

  await expect(
    llm.generate([{
      role: "user",
      content: [{ type: "image_url", image_url: "notaurl" }],
    } as any]),
  ).rejects.toThrow(/Invalid image input/);
});

test("anthropicEmbeddings fallback validates base config and edge parsing", async () => {
  const { anthropicEmbeddings } = await importAnthropicModule();
  const fetchMock = vi.spyOn(globalThis, "fetch" as any);

  expect(() =>
    anthropicEmbeddings({
      apiKey: "k",
      baseUrl: "",
      model: "voyage-3.5",
    }).embed(["x"]),
  ).toThrow();

  const embeddings = anthropicEmbeddings({
    apiKey: "k",
    baseUrl: "https://api.example.com",
    model: "voyage-3.5",
  });
  const ac = new AbortController();
  ac.abort();
  await expect(embeddings.embed(["x"], { signal: ac.signal })).rejects.toThrow(
    /aborted/i,
  );
  await expect(embeddings.embed([])).rejects.toThrow(/at least one string/);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 400,
    statusText: "Bad",
    text: async () => JSON.stringify({ message: "msg" }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/msg/);

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    statusText: "Boom",
    text: async () => JSON.stringify({ code: "X" }),
  } as any);
  await expect(embeddings.embed(["x"])).rejects.toThrow(/\{"code":"X"\}/);

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [1, 2] }] }),
  } as any);
  await expect(embeddings.embed(["a", "b"])).rejects.toThrow(/Expected 2 embeddings, received 1/);
});

test("anthropicAdapter covers schema conversion and content parser warnings", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  process.env.ANTHROPIC_API_KEY = "k";
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  const { z } = await import("zod");
  hoisted.createMock.mockResolvedValueOnce({
    content: [
      { type: "text", text: "ok" },
      { type: "tool_use", id: 1, name: "bad" },
      { type: "tool_use", id: "a", name: "ok", input: { n: 1 } },
    ],
  } as any);
  const out = await llm.generate([{ role: "user", content: "x" } as any], {
    tools: [
      {
        name: "complex",
        description: "complex",
        schema: z.object({
          s: z.string(),
          n: z.number(),
          b: z.boolean(),
          arr: z.array(z.number()),
          e: z.enum(["a", "b"]),
          l: z.literal("x"),
          o: z.object({ x: z.string().optional() }),
        }),
        handler: async () => null,
      },
    ],
    toolChoice: { name: "complex" } as any,
  });
  expect((out.message as any).tool_calls).toHaveLength(1);
  expect(warnSpy).toHaveBeenCalled();

  hoisted.createMock.mockResolvedValueOnce({
    content: [{ type: "text", text: "ok" }],
    usage: { input_tokens: "x", output_tokens: 1 },
  } as any);
  const out2 = await llm.generate([{ role: "user", content: "x" } as any]);
  expect(out2.usage?.promptTokens).toBeUndefined();
  expect(out2.usage?.completionTokens).toBe(1);
  expect(out2.usage?.totalTokens).toBeUndefined();
});

test("anthropicAdapter covers stream fallback final event and abort error passthrough", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  process.env.ANTHROPIC_API_KEY = "k";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  hoisted.createMock.mockResolvedValueOnce(
    (async function* () {
      yield { type: "content_block_delta", delta: { text: "Hi" } };
    })(),
  );
  const events: any[] = [];
  const stream = llm.generate([{ role: "user", content: "x" } as any], { stream: true }) as AsyncIterable<any>;
  for await (const ev of stream) events.push(ev);
  expect(events.some((e) => e.type === "assistant_message")).toBe(true);

  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  hoisted.createMock.mockRejectedValueOnce(abortErr);
  await expect(
    llm.generate([{ role: "user", content: "x" } as any]),
  ).rejects.toThrow(/aborted/i);
});

test("toAnthropicMessage sync path covers assistant/user normalization branches", async () => {
  const { toAnthropicMessage } = await importAnthropicModule();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  const assistant = toAnthropicMessage({
    role: "assistant",
    content: "hello",
    tool_calls: [
      { id: "t1", name: "echo", arguments: { ok: true } },
      { id: "", name: "bad", arguments: {} },
    ],
  } as any);
  expect(assistant.role).toBe("assistant");
  expect(assistant.content[0]).toEqual({ type: "text", text: "hello" });
  expect(assistant.content.some((c: any) => c.type === "tool_use")).toBe(true);
  expect(warnSpy).toHaveBeenCalled();

  const user = toAnthropicMessage({
    role: "user",
    contentParts: [
      "line1",
      { type: "text", text: "line2" },
      { type: "image", url: "data:image/png;base64,AQID" },
      { type: "image", image_url: "data:image/png;base64,BAUG" },
      { type: "image", image_url: { url: "data:image/png;base64,BwgJ" } },
      { image_url: "data:image/png;base64,CAkK" },
      { image: "AQIDBA==" },
      { url: "AQIDBA==" },
    ],
  } as any);
  expect(user.role).toBe("user");
  expect(user.content.length).toBeGreaterThan(2);
  expect(user.content.some((c: any) => c.type === "image")).toBe(true);

  const fallbackText = toAnthropicMessage({
    role: "user",
    content: "",
  } as any);
  expect(fallbackText).toEqual({
    role: "user",
    content: [{ type: "text", text: "" }],
  });
});

test("toAnthropicMessage sync path validates malformed image inputs", async () => {
  const { toAnthropicMessage } = await importAnthropicModule();
  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image_url", image_url: "data:bad" }],
    } as any),
  ).toThrow(/Invalid data URL image input/);

  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image_url", image_url: "data:text/plain;base64,AAAA" }],
    } as any),
  ).toThrow(/Invalid image media type/);

  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image_url", image_url: "data:image/png;base64," }],
    } as any),
  ).toThrow(/Invalid data URL image input/);

  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image_url", image_url: "https://example.com/x.png" }],
    } as any),
  ).toThrow(/Remote image URLs are not supported/);

  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image", source: null }],
    } as any),
  ).toThrow(/expected source object/);

  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image_url", image_url: "" }],
    } as any),
  ).toThrow(/empty string/);

  expect(() =>
    toAnthropicMessage({
      role: "user",
      content: [{ type: "image_url", image_url: { url: "" } }],
    } as any),
  ).toThrow(/empty url/);
});

test("anthropicAdapter covers tool schema conversion and stream tool-choice paths", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  process.env.ANTHROPIC_API_KEY = "k";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  const schemaLike = {
    _def: {
      typeName: "ZodObject",
      shape: () => ({
        s: { _def: { typeName: "ZodString" } },
        n: { _def: { typeName: "ZodNumber" } },
        b: { _def: { typeName: "ZodBoolean" } },
        arr: {
          _def: { typeName: "ZodArray", type: { _def: { typeName: "ZodNumber" } } },
        },
        opt: {
          _def: {
            typeName: "ZodOptional",
            innerType: { _def: { typeName: "ZodString" } },
          },
        },
        def: {
          _def: {
            typeName: "ZodDefault",
            innerType: { _def: { typeName: "ZodBoolean" } },
          },
        },
        e: { _def: { typeName: "ZodEnum", values: ["a", "b"] } },
        l: { _def: { typeName: "ZodLiteral", value: "x" } },
      }),
    },
  } as any;

  hoisted.createMock.mockImplementationOnce(async (body: any) => {
    expect(body.tool_choice).toBeUndefined();
    expect(body.tools[0].input_schema.properties.s.type).toBe("string");
    expect(body.tools[0].input_schema.properties.n.type).toBe("number");
    expect(body.tools[0].input_schema.properties.b.type).toBe("boolean");
    expect(body.tools[0].input_schema.properties.arr.type).toBe("array");
    expect(body.tools[0].input_schema.properties.e.enum).toEqual(["a", "b"]);
    expect(body.tools[0].input_schema.properties.l.enum).toEqual(["x"]);
    return { content: [{ type: "text", text: "ok" }] };
  });

  await llm.generate([{ role: "user", content: "x" } as any], {
    tools: [{ name: "shape", description: "shape", schema: schemaLike, handler: async () => null }],
    toolChoice: {} as any,
  });

  hoisted.createMock.mockImplementationOnce(async (body: any) => {
    expect(body.tool_choice).toEqual({ type: "tool", name: "shape" });
    return (async function* () {
      yield { type: "content_block_delta", delta: { text: "ok" } };
      yield { type: "message_stop" };
    })();
  });
  const stream = llm.generate([{ role: "user", content: "x" } as any], {
    stream: true,
    tools: [{ name: "shape", description: "shape", schema: schemaLike, handler: async () => null }],
    toolChoice: "shape",
  }) as AsyncIterable<any>;
  for await (const _ of stream) {
    // no-op
  }
});

test("anthropicAdapter covers async image normalization edges and model validation", async () => {
  const { anthropicAdapter } = await importAnthropicModule();
  expect(() => anthropicAdapter({ model: "" as any })).toThrow(/model is required/);

  process.env.ANTHROPIC_API_KEY = "k";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });

  hoisted.createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] } as any);
  await llm.generate([{ role: "user", content: "" } as any]);

  hoisted.createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] } as any);
  await llm.generate([
    {
      role: "user",
      content: [{ type: "image_url", image_url: "data:image/png;base64,AQID" }],
    } as any,
  ]);

  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValueOnce(
      new Response(new Uint8Array([]).buffer, {
        status: 200,
        headers: { "content-type": "image/png" },
      }) as any,
    );

  await expect(
    llm.generate([
      {
        role: "user",
        content: [{ type: "image_url", image_url: "https://example.com/empty.png" }],
      } as any,
    ]),
  ).rejects.toThrow(/empty data/);
  expect(fetchMock).toHaveBeenCalledOnce();
});
