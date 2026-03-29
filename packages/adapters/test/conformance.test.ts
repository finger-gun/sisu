import { afterEach, expect, test, vi } from "vitest";
import type { Tool } from "@sisu-ai/core";
import { openAIAdapter } from "../openai/src/index.js";
import { anthropicAdapter } from "../anthropic/src/index.js";
import { ollamaAdapter } from "../ollama/src/index.js";

const NO_CONTENT = {
  openai: { choices: [{ message: { role: "assistant", content: "" } }] },
  anthropic: { content: [{ type: "text", text: "" }] },
  ollama: { message: { role: "assistant", content: "" } },
} as const;

const TOOL_CALLS = {
  openai: {
    choices: [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "tc_1",
              type: "function",
              function: { name: "sum", arguments: '{"x":1}' },
            },
          ],
        },
      },
    ],
  },
  anthropic: {
    content: [{ type: "tool_use", id: "tc_1", name: "sum", input: { x: 1 } }],
  },
  ollama: {
    message: {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "tc_1",
          type: "function",
          function: { name: "sum", arguments: '{"x":1}' },
        },
      ],
    },
  },
} as const;

const STREAM_BODIES = {
  openai: [
    'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
    "data: [DONE]\n\n",
  ],
  anthropic: [
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"He"},"index":0}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"llo"},"index":0}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ],
  ollama: [
    '{"message":{"role":"assistant","content":"He"}}\n',
    '{"message":{"role":"assistant","content":"llo"}}\n',
    '{"done":true}\n',
  ],
} as const;

const ERROR_BODIES = {
  openai: { error: { message: "boom" } },
  anthropic: { type: "error", error: { type: "api_error", message: "boom" } },
  ollama: { error: "boom" },
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).API_KEY;
  delete (process.env as any).OPENAI_API_KEY;
  delete (process.env as any).ANTHROPIC_API_KEY;
  delete (process.env as any).BASE_URL;
});

function requestFromCall(call: unknown[]): Request {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined];
  if (input instanceof Request) return input;
  return new Request(input, init);
}

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

function textResponse(text: string, init: ResponseInit = {}): Response {
  return new Response(text, {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "content-type": "text/plain",
      ...(init.headers ?? {}),
    },
  });
}

function makeTool(): Tool {
  return {
    name: "sum",
    description: "sum",
    schema: {} as any,
    handler: async () => null,
  };
}

function withProviderEnv(provider: "openai" | "anthropic" | "ollama"): void {
  if (provider === "openai") process.env.OPENAI_API_KEY = "test-key";
  if (provider === "anthropic") process.env.ANTHROPIC_API_KEY = "test-key";
}

function makeAdapter(provider: "openai" | "anthropic" | "ollama") {
  if (provider === "openai") return openAIAdapter({ model: "gpt-4o-mini" });
  if (provider === "anthropic")
    return anthropicAdapter({ model: "claude-3-haiku" });
  return ollamaAdapter({ model: "llama3" });
}

function chatPath(provider: "openai" | "anthropic" | "ollama"): string {
  if (provider === "openai") return "/v1/chat/completions";
  if (provider === "anthropic") return "/v1/messages";
  return "/api/chat";
}

for (const provider of ["openai", "anthropic", "ollama"] as const) {
  test(`${provider} conformance: tool choice + cancellation signal behavior`, async () => {
    withProviderEnv(provider);
    process.env.BASE_URL = "https://proxy.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse(NO_CONTENT[provider]) as any);

    const llm = makeAdapter(provider);
    const abortController = new AbortController();
    await llm.generate([{ role: "user", content: "hello" }], {
      tools: [makeTool()],
      toolChoice: "sum",
      signal: abortController.signal,
    });

    const request = requestFromCall(fetchMock.mock.calls[0] as any);
    expect(request.url).toContain(chatPath(provider));
    expect(request.signal.aborted).toBe(false);

    const body = JSON.parse(await request.text());
    if (provider === "openai") {
      expect(body.tool_choice).toEqual({
        type: "function",
        function: { name: "sum" },
      });
      expect(body.tools).toHaveLength(1);
    } else if (provider === "anthropic") {
      expect(body.tool_choice).toEqual({ type: "tool", name: "sum" });
      expect(body.tools).toHaveLength(1);
    } else {
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].function.name).toBe("sum");
    }
  });

  test(`${provider} conformance: tool call normalized shape`, async () => {
    withProviderEnv(provider);
    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(jsonResponse(TOOL_CALLS[provider]) as any);

    const out = await makeAdapter(provider).generate([
      { role: "user", content: "use a tool" },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    if (!("message" in out)) throw new Error("Expected non-stream response");
    const toolCall = (out.message as any).tool_calls?.[0];
    expect(toolCall).toBeDefined();
    expect(toolCall.id).toBe("tc_1");
    expect(toolCall.name).toBe("sum");
    expect(toolCall.arguments).toEqual({ x: 1 });
  });

  test(`${provider} conformance: streaming order and final assistant event`, async () => {
    withProviderEnv(provider);
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      textResponse(STREAM_BODIES[provider].join("")) as any,
    );

    const stream = (await makeAdapter(provider).generate(
      [{ role: "user", content: "stream" }],
      { stream: true },
    )) as AsyncIterable<any>;

    const events: any[] = [];
    for await (const ev of stream) events.push(ev);

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].type).toBe("token");
    expect(events[1].type).toBe("token");
    expect(events.at(-1)?.type).toBe("assistant_message");
    expect(events.filter((ev) => ev.type === "token").map((ev) => ev.token).join("")).toBe(
      "Hello",
    );
    expect(events.at(-1)?.message?.content).toBe("Hello");
  });

  test(`${provider} conformance: actionable error propagation`, async () => {
    withProviderEnv(provider);
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      jsonResponse(ERROR_BODIES[provider], {
        status: provider === "ollama" ? 500 : 429,
        statusText: provider === "ollama" ? "Internal Error" : "Too Many Requests",
      }) as any,
    );

    const llm = makeAdapter(provider);
    await expect(llm.generate([{ role: "user", content: "fail" }])).rejects.toThrow(
      provider === "openai"
        ? /OpenAI API error: 429/i
        : provider === "anthropic"
          ? /Anthropic API error: 429/i
          : /Ollama API error/i,
    );
  });
}
