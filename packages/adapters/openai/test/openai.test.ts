import { test, expect, vi, afterEach } from "vitest";
import { Readable } from "stream";
import { openAIAdapter } from "../src/index.js";
import type { Message, Tool } from "@sisu-ai/core";

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OPENAI_API_KEY;
  delete (process.env as any).OPENAI_BASE_URL;
});

test("openAIAdapter throws without API key", async () => {
  delete (process.env as any).OPENAI_API_KEY;
  expect(() => openAIAdapter({ model: "gpt-4o-mini" })).toThrow(
    /Missing OPENAI_API_KEY/,
  );
});

test("openAIAdapter streams tokens when stream option is set", async () => {
  process.env.OPENAI_API_KEY = "stream";
  const s = Readable.from([
    'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
    "data: [DONE]\n\n",
  ]);
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue({ ok: true, body: s } as any);
  const llm = openAIAdapter({ model: "gpt-4o" });
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

test("openAIAdapter posts messages and returns mapped response with usage", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      }),
  } as any);

  const llm = openAIAdapter({
    model: "gpt-4o-mini",
    baseUrl: "https://api.example.com",
  });
  const msgs: Message[] = [{ role: "user", content: "hello" } as any];
  const out = await llm.generate(msgs, { temperature: 0.1 });
  expect(out.message.role).toBe("assistant");
  expect(out.message.content).toBe("ok");
  expect(out.usage?.promptTokens).toBe(10);
  expect(out.usage?.completionTokens).toBe(2);
  expect(out.usage?.totalTokens).toBe(12);

  // Verify request built correctly
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toBe("https://api.example.com/v1/chat/completions");
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toContain("Bearer test-key");
  const body = JSON.parse(init.body);
  expect(body.model).toBe("gpt-4o-mini");
  expect(Array.isArray(body.messages)).toBe(true);
});

test("openAIAdapter maps tool_calls and tool_choice in request/response", async () => {
  process.env.OPENAI_API_KEY = "x";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url, init) => {
      const req = JSON.parse((init as any).body);
      // Tool choice should be mapped to function object when a specific tool name is provided
      expect(req.tool_choice).toEqual({
        type: "function",
        function: { name: "echo" },
      });
      // Assistant message with tool_calls should map to OpenAI structure and content null when no content
      const assistant = req.messages.find((m: any) => m.role === "assistant");
      expect(assistant.tool_calls?.[0]?.function?.name).toBe("echo");
      expect(assistant.content).toBeNull();
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "done",
                  tool_calls: [
                    {
                      id: "1",
                      type: "function",
                      function: { name: "echo", arguments: '{"foo":1}' },
                    },
                  ],
                },
              },
            ],
          }),
      } as any;
    });

  const tool: Tool = {
    name: "echo",
    description: "echoes",
    schema: {} as any,
    handler: async () => null,
  };
  const llm = openAIAdapter({ model: "gpt-4o-mini" });
  const messages: Message[] = [
    // Assistant requesting tools (input mapping)
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
  expect(out.message.content).toBe("done");
  const tc = (out.message as any).tool_calls[0];
  expect(tc.name).toBe("echo");
  expect(tc.arguments).toEqual({ foo: 1 }); // parsed from string

  expect(fetchMock).toHaveBeenCalledOnce();
});

test("openAIAdapter builds image content parts from convenience shapes", async () => {
  process.env.OPENAI_API_KEY = "y";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "" } }],
      }),
  } as any);
  const llm = openAIAdapter({ model: "gpt-4o" });
  const messages: Message[] = [
    {
      role: "user",
      content: "see",
      images: ["http://img/1.png", "http://img/2.png"],
    } as any,
  ];
  await llm.generate(messages);
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  const user = body.messages[0];
  expect(Array.isArray(user.content)).toBe(true);
  expect(user.content.some((p: any) => p.type === "image_url")).toBe(true);
});

test("openAIAdapter builds content parts from contentParts and image aliases", async () => {
  process.env.OPENAI_API_KEY = "img-alias";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }),
  } as any);

  const llm = openAIAdapter({ model: "gpt-4o-mini" });
  const messages: Message[] = [
    {
      role: "user",
      contentParts: [
        "hello",
        { type: "image_url", image_url: { url: "http://img/1.png" } },
        { type: "image", url: "http://img/2.png" },
      ],
    } as any,
    {
      role: "user",
      content: "caption",
      image_url: "http://img/3.png",
      image: "data:image/png;base64,AQID",
    } as any,
  ];

  await llm.generate(messages);
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  const first = body.messages[0];
  expect(Array.isArray(first.content)).toBe(true);
  expect(first.content).toHaveLength(3);
  expect(first.content.some((p: any) => p.type === "image_url")).toBe(true);

  const second = body.messages[1];
  expect(Array.isArray(second.content)).toBe(true);
  expect(second.content).toHaveLength(3);
  const imageParts = second.content.filter((p: any) => p.type === "image_url");
  expect(imageParts).toHaveLength(2);
});

test("openAIAdapter throws on HTTP error with message", async () => {
  process.env.OPENAI_API_KEY = "z";
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: false,
    status: 400,
    statusText: "Bad",
    text: async () => JSON.stringify({ error: { message: "bad req" } }),
  } as any);
  const llm = openAIAdapter({ model: "gpt-4o" });
  await expect(llm.generate([], {})).rejects.toThrow(/OpenAI API error: 400/);
});

test("openAIAdapter maps function_call response to tool_calls", async () => {
  process.env.OPENAI_API_KEY = "fn-call";
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              function_call: { name: "echo", arguments: '{"a":1}' },
            },
          },
        ],
      }),
  } as any);

  const llm = openAIAdapter({ model: "gpt-4o-mini" });
  const out = await llm.generate([{ role: "user", content: "test" }]);
  const tcs = (out.message as any).tool_calls;
  expect(Array.isArray(tcs)).toBe(true);
  expect(tcs[0].name).toBe("echo");
  expect(tcs[0].arguments).toEqual({ a: 1 });
  expect(String(tcs[0].id || "")).toContain("fc_echo_");
});

test("openAIAdapter includes tool_choice none when tools are provided", async () => {
  process.env.OPENAI_API_KEY = "tool-choice";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }),
  } as any);

  const tool: Tool = {
    name: "echo",
    description: "echo",
    schema: {} as any,
    handler: async () => null,
  };
  const llm = openAIAdapter({ model: "gpt-4o-mini" });
  await llm.generate([{ role: "user", content: "hi" }], {
    tools: [tool],
    toolChoice: "none",
  });

  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  expect(body.tool_choice).toBe("none");
});

test("openAIAdapter maps invalid tool_call arguments as raw string", async () => {
  process.env.OPENAI_API_KEY = "bad-args";
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "t1",
                  type: "function",
                  function: { name: "echo", arguments: "{bad" },
                },
              ],
            },
          },
        ],
      }),
  } as any);

  const llm = openAIAdapter({ model: "gpt-4o-mini" });
  const out = await llm.generate([{ role: "user", content: "hi" }]);
  const tcs = (out.message as any).tool_calls;
  expect(tcs[0].arguments).toBe("{bad");
});

test("openAIAdapter converts zod schemas to JSON schema", async () => {
  process.env.OPENAI_API_KEY = "zod-schema";
  const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }),
  } as any);

  const { z } = await import("zod");
  const tool: Tool = {
    name: "sum",
    description: "sum",
    schema: z.object({
      nums: z.array(z.number()),
      flag: z.boolean().optional(),
      meta: z.object({ id: z.string() }),
    }),
    handler: async () => null,
  };

  const llm = openAIAdapter({ model: "gpt-4o-mini" });
  await llm.generate([{ role: "user", content: "hi" }], { tools: [tool] });

  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  const params = body.tools[0].function.parameters;
  expect(params.type).toBe("object");
});

test("openAIAdapter sends reasoning parameter as object when boolean true", async () => {
  process.env.OPENAI_API_KEY = "test-reasoning";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url, init) => {
      const req = JSON.parse((init as any).body);
      expect(req.reasoning).toEqual({ enabled: true });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              { message: { role: "assistant", content: "The answer is 3" } },
            ],
          }),
      } as any;
    });

  const llm = openAIAdapter({ model: "gpt-5.1" });
  await llm.generate([{ role: "user", content: "test" }], { reasoning: true });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("openAIAdapter sends reasoning parameter as-is when object provided", async () => {
  process.env.OPENAI_API_KEY = "test-reasoning-obj";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url, init) => {
      const req = JSON.parse((init as any).body);
      expect(req.reasoning).toEqual({ enabled: true });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "response" } }],
          }),
      } as any;
    });

  const llm = openAIAdapter({ model: "gpt-5.1" });
  await llm.generate([{ role: "user", content: "test" }], {
    reasoning: { enabled: true },
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("openAIAdapter captures reasoning_details from response", async () => {
  process.env.OPENAI_API_KEY = "test-reasoning-details";
  const mockReasoningDetails = {
    thinking_time: 5.2,
    effort: "high",
    steps: ["analyze", "count", "verify"],
  };

  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: "There are 3 rs",
              reasoning_details: mockReasoningDetails,
            },
          },
        ],
      }),
  } as any);

  const llm = openAIAdapter({ model: "gpt-5.1" });
  const out = await llm.generate([{ role: "user", content: "test" }], {
    reasoning: true,
  });

  expect(out.message.reasoning_details).toEqual(mockReasoningDetails);
});

test("openAIAdapter preserves reasoning_details in multi-turn conversation", async () => {
  process.env.OPENAI_API_KEY = "test-multi-turn";
  const mockReasoningDetails = {
    thinking_time: 3.1,
    confidence: 0.95,
  };

  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url, init) => {
      const req = JSON.parse((init as any).body);
      const assistantMsg = req.messages.find(
        (m: any) => m.role === "assistant",
      );

      // Verify reasoning_details was preserved in the request
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.reasoning_details).toEqual(mockReasoningDetails);

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              { message: { role: "assistant", content: "Follow-up response" } },
            ],
          }),
      } as any;
    });

  const llm = openAIAdapter({ model: "gpt-5.1" });
  const messages: Message[] = [
    { role: "user", content: "How many rs in strawberry?" },
    {
      role: "assistant",
      content: "There are 3",
      reasoning_details: mockReasoningDetails,
    } as any,
    { role: "user", content: "Are you sure?" },
  ];

  await llm.generate(messages, { reasoning: true });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("openAIAdapter works without reasoning parameter (backward compatible)", async () => {
  process.env.OPENAI_API_KEY = "test-no-reasoning";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url, init) => {
      const req = JSON.parse((init as any).body);
      expect(req.reasoning).toBeUndefined();
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              { message: { role: "assistant", content: "Normal response" } },
            ],
          }),
      } as any;
    });

  const llm = openAIAdapter({ model: "gpt-4o" });
  const out = await llm.generate([{ role: "user", content: "test" }]);

  expect(out.message.content).toBe("Normal response");
  expect(out.message.reasoning_details).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("openAIAdapter captures reasoning_details in streaming mode", async () => {
  process.env.OPENAI_API_KEY = "test-reasoning-stream";
  const mockReasoningDetails = {
    thinking_time: 2.8,
    steps: ["understand", "analyze", "respond"],
  };

  const { Readable } = await import("stream");
  const s = Readable.from([
    'data: {"choices":[{"delta":{"content":"I"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" think"}}]}\n\n',
    'data: {"choices":[{"message":{"reasoning_details":' +
      JSON.stringify(mockReasoningDetails) +
      "}}]}\n\n",
    "data: [DONE]\n\n",
  ]);

  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
    ok: true,
    body: s,
  } as any);

  const llm = openAIAdapter({ model: "gpt-5.1" });
  const events: any[] = [];
  const iter = (await llm.generate([{ role: "user", content: "test" }], {
    stream: true,
    reasoning: true,
  })) as AsyncIterable<any>;

  for await (const ev of iter) {
    events.push(ev);
  }

  // Should have token events plus final assistant message
  const tokenEvents = events.filter((e) => e.type === "token");
  const assistantEvents = events.filter((e) => e.type === "assistant_message");

  expect(tokenEvents).toHaveLength(2);
  expect(tokenEvents[0].token).toBe("I");
  expect(tokenEvents[1].token).toBe(" think");

  expect(assistantEvents).toHaveLength(1);
  expect(assistantEvents[0].message.content).toBe("I think");
  expect(assistantEvents[0].message.reasoning_details).toEqual(
    mockReasoningDetails,
  );
});
