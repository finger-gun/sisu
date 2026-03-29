import { test, expect, vi, afterEach } from "vitest";
import { Readable } from "stream";
import {
  anthropicAdapter,
  anthropicEmbeddings,
  toAnthropicMessage,
} from "../src/index.js";
import type { Message, Tool } from "@sisu-ai/core";

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).ANTHROPIC_API_KEY;
  delete (process.env as any).ANTHROPIC_BASE_URL;
  delete (process.env as any).API_KEY;
  delete (process.env as any).BASE_URL;
});

test("anthropicAdapter streams tokens when stream option is set", async () => {
  process.env.ANTHROPIC_API_KEY = "stream";
  const s = Readable.from([
    'data: {"type":"content_block_delta","delta":{"text":"He"}}\n\n',
    'data: {"type":"content_block_delta","delta":{"text":"llo"}}\n\n',
    'data: {"type":"message_stop"}\n\n',
  ]);
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue({ ok: true, body: s } as any);
  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const out: string[] = [];
  const iter = (await llm.generate([], { stream: true })) as AsyncIterable<any>;
  for await (const ev of iter) {
    if (ev.type === "token") out.push(ev.token);
  }
  expect(out.join("")).toBe("Hello");
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  expect(body.stream).toBe(true);
});

test("anthropicAdapter uses retry-after for 429 backoff", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  const sleepSpy = vi.spyOn(globalThis, "setTimeout");
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Map([["retry-after", "0"]]),
      text: async () => JSON.stringify({ error: { message: "rate limited" } }),
    } as any)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Map(),
      text: async () =>
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
    } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku", maxRetries: 1 });
  const messages: Message[] = [{ role: "user", content: "hello" }];
  const out = await llm.generate(messages, { temperature: 0.1 });
  if ("message" in out) {
    expect(out.message.content).toBe("ok");
  }
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(sleepSpy.mock.calls.some((call) => call[1] === 0)).toBe(true);
});

test("anthropicAdapter throws without API key", async () => {
  expect(() => anthropicAdapter({ model: "claude-3-haiku" })).toThrow(
    /Missing API_KEY or ANTHROPIC_API_KEY/,
  );
});

test("anthropicEmbeddings requires explicit baseUrl and model", async () => {
  expect(() =>
    anthropicEmbeddings({
      baseUrl: "",
      model: "voyage-3.5",
    }),
  ).toThrow(/baseUrl is required/i);

  expect(() =>
    anthropicEmbeddings({
      baseUrl: "https://api.example.com",
      model: "",
    }),
  ).toThrow(/model is required/i);
});

test("anthropicEmbeddings uses explicit compatible endpoint config", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
  } as any);

  const embeddings = anthropicEmbeddings({
    apiKey: "voyage-key",
    baseUrl: "https://api.voyageai.com",
    model: "voyage-3.5",
  });

  const vectors = await embeddings.embed(["hello"]);
  expect(vectors).toEqual([[0.1, 0.2]]);

  const [url, init] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toBe("https://api.voyageai.com/v1/embeddings");
  expect(init.headers.Authorization).toBe("Bearer voyage-key");
  expect(JSON.parse(init.body)).toEqual({
    model: "voyage-3.5",
    input: ["hello"],
  });
});

test("anthropicAdapter prefers generic API_KEY and BASE_URL over adapter-specific env", async () => {
  process.env.API_KEY = "generic-key";
  process.env.ANTHROPIC_API_KEY = "provider-key";
  process.env.BASE_URL = "https://generic.example.com";
  process.env.ANTHROPIC_BASE_URL = "https://provider.example.com";

  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        content: [{ type: "text", text: "hi" }],
      }),
  } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  await llm.generate([{ role: "user", content: "hello" }]);

  const [url, init] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toBe("https://generic.example.com/v1/messages");
  expect(init.headers["x-api-key"]).toBe("generic-key");
});

test("anthropicAdapter posts messages and returns mapped response with usage", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        content: [{ type: "text", text: "hi" }],
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
  } as any);

  const llm = anthropicAdapter({
    model: "claude-3-haiku",
    baseUrl: "https://api.example.com",
  });
  const msgs: Message[] = [{ role: "user", content: "hello" }];
  const out = await llm.generate(msgs, { temperature: 0.1 });
  // Ensure 'out' is a ModelResponse, not an AsyncIterable
  if ("message" in out) {
    expect(out.message.role).toBe("assistant");
    expect(out.message.content).toBe("hi");
    expect(out.usage?.promptTokens).toBe(5);
    expect(out.usage?.completionTokens).toBe(3);
    expect(out.usage?.totalTokens).toBe(8);
  } else {
    throw new Error("Expected ModelResponse, got AsyncIterable");
  }

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toBe("https://api.example.com/v1/messages");
  expect(init.method).toBe("POST");
  expect(init.headers["x-api-key"]).toBe("test");
  const body = JSON.parse(init.body);
  expect(body.model).toBe("claude-3-haiku");
  expect(Array.isArray(body.messages)).toBe(true);
});

test("anthropicAdapter maps tool calls and tool_choice", async () => {
  process.env.ANTHROPIC_API_KEY = "x";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (_url, init) => {
      const req = JSON.parse((init as any).body);
      expect(req.tool_choice).toEqual({ type: "tool", name: "echo" });
      const assistant = req.messages.find((m: any) => m.role === "assistant");
      const tc = assistant.content.find((c: any) => c.type === "tool_use");
      expect(tc.name).toBe("echo");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            content: [
              { type: "tool_use", id: "1", name: "echo", input: { foo: 1 } },
            ],
          }),
      } as any;
    });

  const tool: Tool = {
    name: "echo",
    description: "echo",
    schema: {} as any,
    handler: async () => null,
  };
  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "1", name: "echo", arguments: { foo: 1 } }],
    } as any,
  ];
  const out = await llm.generate(messages, {
    tools: [tool],
    toolChoice: "echo",
  });
  if ("message" in out) {
    const tcs = (out.message as any).tool_calls;
    expect(Array.isArray(tcs)).toBe(true);
    expect(tcs[0].name).toBe("echo");
    expect(tcs[0].arguments).toEqual({ foo: 1 });
  } else {
    throw new Error("Expected ModelResponse, got AsyncIterable");
  }
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('anthropicAdapter maps "auto" and "none" toolChoice to objects', async () => {
  process.env.ANTHROPIC_API_KEY = "x";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
  } as any);

  const tool: Tool = {
    name: "echo",
    description: "echo",
    schema: {} as any,
    handler: async () => null,
  };
  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [{ role: "user", content: "hi" }];

  await llm.generate(messages, { tools: [tool], toolChoice: "auto" });
  const firstReq = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
  expect(firstReq.tool_choice).toEqual({ type: "auto" });

  await llm.generate(messages, { tools: [tool], toolChoice: "none" });
  const secondReq = JSON.parse((fetchMock.mock.calls[1] as any)[1].body);
  expect(secondReq.tool_choice).toEqual({ type: "none" });
});

test("anthropicAdapter omits tool_choice when no tools provided", async () => {
  process.env.ANTHROPIC_API_KEY = "x";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (_url, init) => {
      const req = JSON.parse((init as any).body);
      expect(req.tool_choice).toBeUndefined();
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
      } as any;
    });

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [{ role: "user", content: "hello" }];
  await llm.generate(messages, { toolChoice: "none" });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("anthropicAdapter maps tool_result for tool messages", async () => {
  process.env.ANTHROPIC_API_KEY = "tool-result";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
  } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "" } as any,
    { role: "tool", content: "result", tool_call_id: "t1" } as any,
  ];

  await llm.generate(messages, { toolChoice: "none" });
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  const toolResult = body.messages.find((m: any) =>
    m?.content?.some((c: any) => c?.type === "tool_result"),
  );
  const block = toolResult?.content?.find((c: any) => c.type === "tool_result");
  expect(block.tool_use_id).toBe("t1");
  expect(block.content).toBe("result");
});

test("anthropicAdapter maps tool_choice to tool name", async () => {
  process.env.ANTHROPIC_API_KEY = "tool-choice";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
  } as any);

  const tool: Tool = {
    name: "echo",
    description: "echo",
    schema: {} as any,
    handler: async () => null,
  };
  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  await llm.generate([{ role: "user", content: "hello" }], {
    tools: [tool],
    toolChoice: "echo",
  });

  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  expect(body.tool_choice).toEqual({ type: "tool", name: "echo" });
});

test("anthropicAdapter maps text+image content parts into Anthropic image blocks", async () => {
  process.env.ANTHROPIC_API_KEY = "vision";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({ content: [{ type: "text", text: "described" }] }),
  } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const dataUrl = "data:image/png;base64,Zm9vYmFy";
  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Describe this image" },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    } as any,
  ];

  await llm.generate(messages, { toolChoice: "none" });

  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  expect(body.messages[0].content[0]).toEqual({
    type: "text",
    text: "Describe this image",
  });
  expect(body.messages[0].content[1]).toEqual({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: "Zm9vYmFy",
    },
  });
});

test("anthropicAdapter normalizes convenience image fields with URL fetch", async () => {
  process.env.ANTHROPIC_API_KEY = "vision-url";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "image/png" },
      arrayBuffer: async () => Uint8Array.from([97, 98, 99]).buffer,
    } as any)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
    } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [
    {
      role: "user",
      content: "What is in this image?",
      image_url: "https://example.com/image.png",
    } as any,
  ];

  await llm.generate(messages, { toolChoice: "none" });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [, init] = fetchMock.mock.calls[1] as any;
  const body = JSON.parse(init.body);
  expect(body.messages[0].content[0]).toEqual({
    type: "text",
    text: "What is in this image?",
  });
  expect(body.messages[0].content[1]).toEqual({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: "YWJj",
    },
  });
});

test("anthropicAdapter rejects invalid image input payloads", async () => {
  process.env.ANTHROPIC_API_KEY = "vision-invalid";
  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [
    {
      role: "user",
      content: [{ type: "image_url", image_url: { nope: "x" } }],
    } as any,
  ];

  await expect(llm.generate(messages, { toolChoice: "none" })).rejects.toThrow(
    /Invalid image input/,
  );
});

test("anthropicAdapter surfaces remote image fetch failures", async () => {
  process.env.ANTHROPIC_API_KEY = "vision-fetch-fail";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "not found",
  } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [
    {
      role: "user",
      content: [{ type: "image_url", image_url: "https://example.com/missing.png" }],
    } as any,
  ];

  await expect(llm.generate(messages, { toolChoice: "none" })).rejects.toThrow(
    /Failed to fetch image URL/,
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("anthropicAdapter keeps tool mappings intact in conversations containing images", async () => {
  process.env.ANTHROPIC_API_KEY = "vision-tools";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    } as any)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
    } as any);

  const llm = anthropicAdapter({ model: "claude-3-haiku" });
  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Look at this" },
        { type: "image_url", image_url: "https://example.com/photo.jpg" },
      ],
    } as any,
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "tc1", name: "echo", arguments: { ok: true } }],
    } as any,
    { role: "tool", content: "done", tool_call_id: "tc1" } as any,
  ];

  await llm.generate(messages, {
    tools: [
      {
        name: "echo",
        description: "echo",
        schema: {} as any,
        handler: async () => null,
      },
    ],
    toolChoice: "echo",
  });

  const [, init] = fetchMock.mock.calls[1] as any;
  const body = JSON.parse(init.body);
  const assistant = body.messages.find((m: any) => m.role === "assistant");
  const toolUse = assistant.content.find((c: any) => c.type === "tool_use");
  expect(toolUse.id).toBe("tc1");
  expect(toolUse.name).toBe("echo");
  const toolResultMsg = body.messages.find((m: any) =>
    m.content.some((c: any) => c.type === "tool_result"),
  );
  const toolResult = toolResultMsg.content.find((c: any) => c.type === "tool_result");
  expect(toolResult.tool_use_id).toBe("tc1");
  expect(toolResult.content).toBe("done");
});

test("anthropicAdapter rejects tool messages without id or name", async () => {
  process.env.ANTHROPIC_API_KEY = "missing-tool-id";
  const bad = { role: "tool", content: "result" } as any;
  expect(() => toAnthropicMessage(bad)).toThrow(
    /Tool message must have tool_call_id or name/,
  );
});
