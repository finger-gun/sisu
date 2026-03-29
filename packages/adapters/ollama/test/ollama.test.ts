import { test, expect, vi, afterEach } from "vitest";
import { ollamaAdapter, ollamaEmbeddings } from "../src/index.js";
import type { Message, Tool } from "@sisu-ai/core";

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OLLAMA_BASE_URL;
});

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function ndjsonResponse(lines: unknown[]): Response {
  const body = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

function requestFromCall(call: unknown[]): Request {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined];
  if (input instanceof Request) return input;
  return new Request(input, init);
}

test("ollamaEmbeddings maps Ollama /api/embed responses", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      jsonResponse({
        model: "embeddinggemma",
        embeddings: [
          [0.01, 0.02],
          [0.03, 0.04],
        ],
      }) as any,
    );

  const embeddings = ollamaEmbeddings({ model: "embeddinggemma" });
  const vectors = await embeddings.embed(["a", "b"]);
  expect(vectors).toEqual([
    [0.01, 0.02],
    [0.03, 0.04],
  ]);

  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  expect(request.url).toBe("http://localhost:11434/api/embed");
  expect(JSON.parse(await request.text())).toEqual({
    model: "embeddinggemma",
    input: ["a", "b"],
  });
});

test("ollamaEmbeddings honors configured base URL", async () => {
  process.env.OLLAMA_BASE_URL = "http://localhost:22434";
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(jsonResponse({ embeddings: [[1, 2, 3]] }) as any);

  const embeddings = ollamaEmbeddings({ model: "embeddinggemma" });
  await embeddings.embed(["hello"]);
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  expect(request.url).toBe("http://localhost:22434/api/embed");
});

test("ollamaEmbeddings prefers generic BASE_URL over OLLAMA_BASE_URL", async () => {
  process.env.BASE_URL = "http://localhost:33434";
  process.env.OLLAMA_BASE_URL = "http://localhost:22434";

  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(jsonResponse({ embeddings: [[1, 2, 3]] }) as any);

  const embeddings = ollamaEmbeddings({ model: "embeddinggemma" });
  await embeddings.embed(["hello"]);
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  expect(request.url).toBe("http://localhost:33434/api/embed");
});

test("ollamaAdapter streams tokens when stream option is set", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      ndjsonResponse([
        { message: { role: "assistant", content: "He" } },
        { message: { role: "assistant", content: "llo" } },
        { done: true },
      ]) as any,
    );
  const llm = ollamaAdapter({ model: "llama3" });
  const out: string[] = [];
  const iter = (await llm.generate([], { stream: true })) as AsyncIterable<any>;
  for await (const ev of iter) {
    if (ev.type === "token") out.push(ev.token);
  }
  expect(out.join("")).toBe("Hello");
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  const body = JSON.parse(await request.text());
  expect(body.stream).toBe(true);
});

test("ollamaAdapter posts to /api/chat with mapped messages", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      jsonResponse({
        message: { role: "assistant", content: "ok" },
        done: true,
      }) as any,
    );

  const llm = ollamaAdapter({
    model: "llama3",
    baseUrl: "http://localhost:11434",
  });
  const msgs: Message[] = [
    { role: "user", content: "hi" } as any,
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "1", name: "echo", arguments: { a: 1 } }],
    } as any,
    { role: "tool", content: "result", tool_call_id: "1" } as any,
  ];
  const out = await llm.generate(msgs);
  expect(out.message.role).toBe("assistant");
  expect(out.message.content).toBe("ok");

  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  expect(request.url).toBe("http://localhost:11434/api/chat");
  const body = JSON.parse(await request.text());
  expect(body.model).toBe("llama3");
  // Assistant tool_calls mapping
  const assistant = body.messages.find((m: any) => m.role === "assistant");
  expect(assistant.tool_calls?.[0]?.function?.name).toBe("echo");
  // Tool message mapping
  const tool = body.messages.find((m: any) => m.role === "tool");
  expect(tool.tool_call_id).toBe("1");
});

test("ollamaAdapter maps tool_calls from response to core shape", async () => {
  vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
    jsonResponse({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "t1",
            type: "function",
            function: { name: "sum", arguments: '{"x":1}' },
          },
        ],
      },
    }) as any,
  );
  const llm = ollamaAdapter({ model: "llama3" });
  const out = await llm.generate([]);
  const tcs = (out.message as any).tool_calls;
  expect(tcs[0].name).toBe("sum");
  expect(tcs[0].arguments).toEqual({ x: 1 });
});

test("ollamaAdapter sends tools schema when provided", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      jsonResponse({ message: { role: "assistant", content: "" } }) as any,
    );
  const tool: Tool = {
    name: "echo",
    description: "e",
    schema: {} as any,
    handler: async () => null,
  };
  const llm = ollamaAdapter({ model: "llama3" });
  await llm.generate([], { tools: [tool] });
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  const body = JSON.parse(await request.text());
  expect(Array.isArray(body.tools)).toBe(true);
  expect(body.tools[0].function.name).toBe("echo");
});

test("ollamaAdapter maps content parts to images list", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      jsonResponse({ message: { role: "assistant", content: "" } }) as any,
    );
  const llm = ollamaAdapter({ model: "llama3" });
  const messages: Message[] = [
    {
      role: "user",
      contentParts: [
        "hi",
        { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
        { type: "image", url: "data:image/png;base64,BAUG" },
      ],
    } as any,
  ];
  await llm.generate(messages);
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  const body = JSON.parse(await request.text());
  const user = body.messages[0];
  expect(typeof user.content).toBe("string");
  expect(user.content).toBe("hi");
  expect(Array.isArray(user.images)).toBe(true);
  expect(user.images).toEqual(["AQID", "BAUG"]);
});

test("ollamaAdapter includes tool name when tool_call_id missing", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      jsonResponse({
        message: { role: "assistant", content: "ok" },
        done: true,
      }) as any,
    );
  const llm = ollamaAdapter({ model: "llama3" });
  const messages: Message[] = [
    { role: "tool", content: "result", name: "echo" } as any,
  ];
  await llm.generate(messages);
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  const body = JSON.parse(await request.text());
  const toolMsg = body.messages.find((m: any) => m.role === "tool");
  expect(toolMsg.name).toBe("echo");
});

test("ollamaAdapter preserves base64 images when already provided", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockResolvedValue(
      jsonResponse({ message: { role: "assistant", content: "ok" } }) as any,
    );

  const llm = ollamaAdapter({ model: "llama3" });
  const messages: Message[] = [
    { role: "user", content: "see", images: ["AQID"] } as any,
  ];
  await llm.generate(messages);
  const request = requestFromCall(fetchMock.mock.calls[0] as any);
  const body = JSON.parse(await request.text());
  const user = body.messages[0];
  expect(user.images).toEqual(["AQID"]);
});

test("ollamaAdapter converts http image URLs to base64 images[]", async () => {
  const imgBytes = new Uint8Array([1, 2, 3, 4]);
  const imgB64 = Buffer.from(imgBytes).toString("base64"); // AQIDBA==
  const fetchMock = vi
    .spyOn(globalThis, "fetch" as any)
    .mockImplementation(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("/api/chat")) {
        return jsonResponse({ message: { role: "assistant", content: "" } }) as any;
      }
      // image fetch
      return new Response(imgBytes.buffer, { status: 200 }) as any;
    });
  const llm = ollamaAdapter({ model: "llama3" });
  const messages: Message[] = [
    {
      role: "user",
      content: "see",
      images: ["http://img/1.png", "http://img/2.png"],
    } as any,
  ];
  await llm.generate(messages);
  // Last call should be to /api/chat; inspect its body
  const calls = fetchMock.mock.calls as any[];
  const chatCall = calls.find((c) => {
    const req = requestFromCall(c as any);
    return req.url.includes("/api/chat");
  }) as any;
  const body = JSON.parse(await requestFromCall(chatCall).text());
  const user = body.messages[0];
  expect(typeof user.content).toBe("string");
  expect(Array.isArray(user.images)).toBe(true);
  expect(user.images).toEqual([imgB64, imgB64]);
});
