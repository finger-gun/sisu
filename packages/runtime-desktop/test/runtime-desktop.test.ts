import { describe, expect, test } from "vitest";
import type { LLM, Message, ModelEvent, ModelResponse } from "@sisu-ai/core";
import {
  createRuntimeController,
  createRuntimeHttpServer,
  runtimeDesktopInternal,
  simpleProvider,
  staticTextModel,
} from "../src/index.js";

describe("runtime desktop controller", () => {
  test("starts in ready state when dependencies are healthy", async () => {
    const runtime = createRuntimeController({
      dependencies: [{ id: "ollama", status: "ok" }],
    });

    expect(runtime.status().state).toBe("stopped");

    const started = await runtime.start();
    expect(started.state).toBe("ready");
  });

  test("starts in degraded state when dependency fails", async () => {
    const runtime = createRuntimeController({
      dependencies: [{ id: "ollama", status: "failed", reason: "offline" }],
    });

    const started = await runtime.start();
    expect(started.state).toBe("degraded");
  });

  test("dependency status transitions update runtime state", async () => {
    const runtime = createRuntimeController();
    await runtime.start();

    const degraded = runtime.setDependencyStatus("openai", "failed", "timeout");
    expect(degraded.state).toBe("degraded");

    const ready = runtime.setDependencyStatus("openai", "ok");
    expect(ready.state).toBe("ready");
  });

  test("stop keeps runtime in stopped state", async () => {
    const runtime = createRuntimeController();
    await runtime.start();
    await runtime.stop();

    const afterStop = runtime.setDependencyStatus("anthropic", "failed");
    expect(afterStop.state).toBe("stopped");
  });

  test("streams token events and completes generation", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-4o-mini",
              displayName: "GPT-4o mini",
              capabilities: {
                streaming: true,
                imageInput: true,
                toolCalling: true,
              },
            },
          ],
          () => staticTextModel("mock-openai", "hello world"),
        ),
      ],
    });
    await runtime.start();
    const accepted = await runtime.generate({
      prompt: "hello",
      modelId: "gpt-4o-mini",
      providerId: "openai",
      stream: true,
    });
    expect(accepted.status).toBe("streaming");
    const events: string[] = [];
    for await (const event of runtime.streamEvents(accepted.streamId)) {
      events.push(event.type);
    }
    expect(events).toContain("message.started");
    expect(events).toContain("token.delta");
    expect(events.at(-1)).toBe("message.completed");
    const status = await runtime.getStreamStatus(accepted.streamId);
    expect(status?.status).toBe("completed");
  });

  test("cancel marks stream as cancelled", async () => {
    const slowModel: LLM = {
      name: "slow",
      capabilities: { streaming: true },
      generate(
        _messages: Message[],
        opts?: import("@sisu-ai/core").GenerateOptions,
      ): Promise<ModelResponse> | AsyncIterable<ModelEvent> {
        return (async function* () {
          yield { type: "token", token: "one" } as ModelEvent;
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
          if (opts?.signal?.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          yield { type: "assistant_message", message: { role: "assistant", content: "done" } } as ModelEvent;
        })();
      },
    };
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "ollama",
          "Ollama",
          [
            {
              providerId: "ollama",
              modelId: "llama3",
              displayName: "Llama3",
              capabilities: {
                streaming: true,
                imageInput: false,
                toolCalling: true,
              },
            },
          ],
          () => slowModel,
        ),
      ],
    });
    await runtime.start();
    const accepted = await runtime.generate({
      prompt: "cancel me",
      modelId: "llama3",
      providerId: "ollama",
      stream: true,
    });
    const cancelResult = await runtime.cancelStream(accepted.streamId);
    expect(cancelResult.status).toBe("cancelling");
    let terminal: string | undefined;
    for await (const event of runtime.streamEvents(accepted.streamId)) {
      terminal = event.type;
    }
    expect(terminal).toBe("message.cancelled");
    const status = await runtime.getStreamStatus(accepted.streamId);
    expect(status?.status).toBe("cancelled");
  });

  test("branch and search APIs work with persisted messages", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "anthropic",
          "Anthropic",
          [
            {
              providerId: "anthropic",
              modelId: "claude-sonnet-4",
              displayName: "Claude Sonnet 4",
              capabilities: {
                streaming: true,
                imageInput: true,
                toolCalling: true,
              },
            },
          ],
          () => staticTextModel("mock-anthropic", "searchable content"),
        ),
      ],
    });
    await runtime.start();
    const accepted = await runtime.generate({
      prompt: "Find this later",
      modelId: "claude-sonnet-4",
      providerId: "anthropic",
      stream: true,
    });
    for await (const _ of runtime.streamEvents(accepted.streamId)) {
      // drain
    }
    const threads = await runtime.listThreads(10);
    expect(threads.items.length).toBeGreaterThan(0);
    const thread = await runtime.getThread(threads.items[0].threadId, 50);
    expect(thread).not.toBeNull();
    if (!thread) return;
    const assistant = thread.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeTruthy();
    if (!assistant) return;
    const branch = await runtime.branchThread({
      sourceMessageId: assistant.messageId,
      title: "branch",
    });
    expect(branch.thread.sourceThreadId).toBe(thread.thread.threadId);
    const search = await runtime.searchHistory("searchable", 10);
    expect(search.items.length).toBeGreaterThan(0);
  });

  test("validates model compatibility for attachments and overrides", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-image",
              displayName: "GPT Image",
              capabilities: {
                streaming: true,
                imageInput: true,
                toolCalling: true,
              },
            },
            {
              providerId: "openai",
              modelId: "gpt-text",
              displayName: "GPT Text",
              capabilities: {
                streaming: true,
                imageInput: false,
                toolCalling: true,
              },
            },
          ],
          (modelId) => staticTextModel(modelId, "ok"),
        ),
      ],
    });
    await runtime.start();
    const thread = await runtime.createThread({
      providerId: "openai",
      modelId: "gpt-image",
      title: "images",
    });
    await runtime.setThreadModelOverride({
      threadId: thread.threadId,
      providerId: "openai",
      modelId: "gpt-text",
    });
    await expect(
      runtime.generate({
        threadId: thread.threadId,
        prompt: "describe",
        modelId: "gpt-text",
        providerId: "openai",
        stream: true,
        attachments: [
          { type: "image", mimeType: "image/png", data: "xyz" },
        ],
      }),
    ).rejects.toMatchObject({
      error: {
        code: "model_incompatible",
      },
    });
  });

  test("http server exposes health and provider routes", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-4o-mini",
              displayName: "GPT-4o mini",
              capabilities: {
                streaming: true,
                imageInput: true,
                toolCalling: true,
              },
            },
          ],
          () => staticTextModel("mock-openai", "ok"),
        ),
      ],
    });
    const server = createRuntimeHttpServer(runtime, { host: "127.0.0.1", port: 0 });
    const started = await server.start();
    const health = await fetch(`http://${started.host}:${started.port}/health`);
    expect(health.status).toBe(200);
    const healthJson = (await health.json()) as { state: string };
    expect(["ready", "degraded"]).toContain(healthJson.state);

    const providers = await fetch(`http://${started.host}:${started.port}/providers`);
    expect(providers.status).toBe(200);
    const providerJson = (await providers.json()) as {
      providers: Array<{ providerId: string }>;
    };
    expect(providerJson.providers[0]?.providerId).toBe("openai");
    await server.stop();
  });

  test("isLocalAddress accepts loopback and rejects non-local", () => {
    expect(runtimeDesktopInternal.isLocalAddress("127.0.0.1")).toBe(true);
    expect(runtimeDesktopInternal.isLocalAddress("::1")).toBe(true);
    expect(runtimeDesktopInternal.isLocalAddress("::ffff:127.0.0.1")).toBe(true);
    expect(runtimeDesktopInternal.isLocalAddress("10.0.0.2")).toBe(false);
  });
});
