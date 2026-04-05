import { describe, expect, test } from "vitest";
import type { LLM, Message, ModelEvent, ModelResponse } from "@sisu-ai/core";
import {
  createDefaultProviders,
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
              modelId: "gpt-5.4",
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
      modelId: "gpt-5.4",
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
              modelId: "gpt-5.4",
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

  test("http server covers settings, threads, streams, search and auth paths", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-5.4",
              displayName: "GPT-4o mini",
              capabilities: { streaming: true, imageInput: true, toolCalling: true },
            },
          ],
          () => staticTextModel("mock-openai", "route response"),
        ),
      ],
    });

    const server = createRuntimeHttpServer(runtime, {
      host: "127.0.0.1",
      port: 0,
      apiKey: "secret",
    });
    const started = await server.start();
    const base = `http://${started.host}:${started.port}`;

    const unauthorized = await fetch(`${base}/health`);
    expect(unauthorized.status).toBe(401);

    const authHeaders = {
      authorization: "Bearer secret",
      "content-type": "application/json",
    };

    const putDefault = await fetch(`${base}/settings/default-model`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-5.4" }),
    });
    expect(putDefault.status).toBe(200);

    const getDefault = await fetch(`${base}/settings/default-model`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(getDefault.status).toBe(200);

    const createThread = await fetch(`${base}/threads`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ title: "routes", providerId: "openai", modelId: "gpt-5.4" }),
    });
    expect(createThread.status).toBe(201);
    const createThreadJson = (await createThread.json()) as { thread: { threadId: string } };
    const threadId = createThreadJson.thread.threadId;

    const listThreads = await fetch(`${base}/threads?limit=5`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(listThreads.status).toBe(200);

    const accepted = await fetch(`${base}/chat/generate`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        threadId,
        prompt: "hello from routes",
        modelId: "gpt-5.4",
      }),
    });
    expect(accepted.status).toBe(202);
    const acceptedJson = (await accepted.json()) as { streamId: string };
    const streamId = acceptedJson.streamId;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const statusRes = await fetch(`${base}/streams/${streamId}/status`, {
        headers: { authorization: "Bearer secret" },
      });
      if (statusRes.status === 200) {
        const statusJson = (await statusRes.json()) as { status: string };
        if (statusJson.status === "completed" || statusJson.status === "failed" || statusJson.status === "cancelled") {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const threadDetail = await fetch(`${base}/threads/${threadId}?limit=100`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(threadDetail.status).toBe(200);
    const detailJson = (await threadDetail.json()) as { messages: Array<{ messageId: string; role: string }> };
    const assistantMessageId = detailJson.messages.find((message) => message.role === "assistant")?.messageId;
    expect(assistantMessageId).toBeTruthy();

    const branch = await fetch(`${base}/threads/branch`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sourceMessageId: assistantMessageId, title: "branch" }),
    });
    expect(branch.status).toBe(201);

    const override = await fetch(`${base}/threads/${threadId}/override-model`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-5.4" }),
    });
    expect(override.status).toBe(200);

    const search = await fetch(`${base}/search?query=routes&limit=5`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(search.status).toBe(200);

    const streamMissing = await fetch(`${base}/streams/missing/status`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(streamMissing.status).toBe(404);

    const cancelMissing = await fetch(`${base}/streams/missing/cancel`, {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    expect(cancelMissing.status).toBe(404);

    const invalidJson = await fetch(`${base}/chat/generate`, {
      method: "POST",
      headers: authHeaders,
      body: "{",
    });
    expect(invalidJson.status).toBe(400);

    const unknown = await fetch(`${base}/nope`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(unknown.status).toBe(404);

    await server.stop();
  });

  test("startup recovery marks pending/streaming messages as cancelled", async () => {
    const logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const storage = runtimeDesktopInternal.makeMemoryStorage(logger);
    const thread = await storage.createThread({
      title: "recover",
      providerId: "openai",
      modelId: "gpt-5.4",
    });
    const pending = await storage.appendMessage({
      threadId: thread.threadId,
      role: "assistant",
      content: "",
      status: "pending",
      providerId: "openai",
      modelId: "gpt-5.4",
    });

    const runtime = createRuntimeController({
      storage,
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-5.4",
              displayName: "GPT-4o mini",
              capabilities: { streaming: true, imageInput: true, toolCalling: true },
            },
          ],
          () => staticTextModel("mock-openai", "ok"),
        ),
      ],
    });

    const started = await runtime.start();
    expect(started.degradedCapabilities).toContain("recovery.pending");
    const recovered = await storage.findMessage(pending.messageId);
    expect(recovered?.status).toBe("cancelled");
  });

  test("runtime validates request edge-cases and terminal stream replay", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-5.4",
              displayName: "GPT-4o mini",
              capabilities: { streaming: true, imageInput: true, toolCalling: true },
            },
          ],
          () => staticTextModel("mock-openai", "ok"),
        ),
      ],
    });

    await runtime.start();

    await expect(runtime.searchHistory("   ")).rejects.toMatchObject({
      error: { code: "invalid_request" },
    });
    await expect(runtime.branchThread({ sourceMessageId: "missing" })).rejects.toMatchObject({
      error: { code: "not_found" },
    });
    await expect(
      runtime.setThreadModelOverride({
        threadId: "missing",
        providerId: "openai",
        modelId: "gpt-5.4",
      }),
    ).rejects.toMatchObject({
      error: { code: "not_found" },
    });

    const accepted = await runtime.generate({
      prompt: "replay",
      providerId: "openai",
      modelId: "gpt-5.4",
      stream: true,
    });
    for await (const _event of runtime.streamEvents(accepted.streamId)) {
      // drain initial stream
    }

    const replayEvents: string[] = [];
    for await (const event of runtime.streamEvents(accepted.streamId)) {
      replayEvents.push(event.type);
    }
    expect(replayEvents[0]).toBe("message.started");
    expect(replayEvents.at(-1)).toBe("message.completed");

    const cancelCompleted = await runtime.cancelStream(accepted.streamId);
    expect(cancelCompleted.status).toBe("completed");

    await runtime.stop();
    await expect(
      runtime.generate({
        prompt: "after stop",
        providerId: "openai",
        modelId: "gpt-5.4",
        stream: true,
      }),
    ).rejects.toMatchObject({
      error: { code: "internal_error" },
    });
  });

  test("http server maps error status codes, SSE route, and start/address branches", async () => {
    const runtime = createRuntimeController({
      providers: [
        simpleProvider(
          "openai",
          "OpenAI",
          [
            {
              providerId: "openai",
              modelId: "gpt-5.4",
              displayName: "GPT-4o mini",
              capabilities: { streaming: true, imageInput: true, toolCalling: true },
            },
          ],
          () => staticTextModel("mock-openai", "sse ok"),
        ),
      ],
    });

    const server = createRuntimeHttpServer(runtime, {
      host: "127.0.0.1",
      port: 0,
      apiKey: "secret",
      maxBodyBytes: 128,
    });

    expect(server.address()).toBeNull();
    const started = await server.start();
    const startedAgain = await server.start();
    expect(startedAgain.port).toBe(started.port);
    expect(server.address()).toBeTruthy();

    const base = `http://${started.host}:${started.port}`;
    const auth = { authorization: "Bearer secret", "content-type": "application/json" };

    const invalidSearch = await fetch(`${base}/search?query=%20%20`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(invalidSearch.status).toBe(400);

    const invalidProvider = await fetch(`${base}/settings/default-model`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ providerId: "missing", modelId: "x" }),
    });
    expect(invalidProvider.status).toBe(503);

    const unavailableModel = await fetch(`${base}/chat/generate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ prompt: "x", providerId: "openai", modelId: "missing-model" }),
    });
    expect(unavailableModel.status).toBe(422);

    const tooLarge = await fetch(`${base}/chat/generate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        prompt:
          "this body is intentionally too large for configured max bytes because it repeats repeatedly repeatedly repeatedly repeatedly",
        providerId: "openai",
        modelId: "gpt-5.4",
      }),
    });
    expect(tooLarge.status).toBe(400);

    const accepted = await fetch(`${base}/chat/generate`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ prompt: "stream me", providerId: "openai", modelId: "gpt-5.4" }),
    });
    expect(accepted.status).toBe(202);
    const acceptedJson = (await accepted.json()) as { streamId: string };
    const events = await fetch(`${base}/streams/${acceptedJson.streamId}/events`, {
      headers: { authorization: "Bearer secret" },
    });
    expect(events.status).toBe(200);
    const sseBody = await events.text();
    expect(sseBody).toContain("event: message.started");

    await server.stop();
    expect(server.address()).toBeNull();
  });

  test("provider helpers expose defaults and static model abort semantics", async () => {
    const providers = createDefaultProviders({
      openAI: { models: ["gpt-5.4-custom"] },
      anthropic: { models: ["claude-custom"] },
      ollama: { models: ["llama-custom"] },
    });
    expect(providers.map((provider) => provider.id)).toEqual(["openai", "anthropic", "ollama"]);
    expect(providers[0]?.models[0]?.modelId).toBe("gpt-5.4-custom");
    expect(providers[1]?.models[0]?.modelId).toBe("claude-custom");
    expect(providers[2]?.models[0]?.modelId).toBe("llama-custom");

    const defaultProviders = createDefaultProviders();
    expect(defaultProviders[0]?.models[0]?.modelId).toBe("gpt-5.4");

    const model = staticTextModel("static", "hello world");
    const nonStream = (await model.generate([
      { role: "user", content: "hi" } as Message,
    ])) as ModelResponse;
    expect(nonStream.message.content).toBe("hello world");

    const controller = new AbortController();
    controller.abort();
    const streamOut = model.generate([], {
      stream: true,
      signal: controller.signal,
    }) as AsyncIterable<ModelEvent>;
    await expect(
      (async () => {
        for await (const _event of streamOut) {
          // should abort before any token is consumed
        }
      })(),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("isLocalAddress accepts loopback and rejects non-local", () => {
    expect(runtimeDesktopInternal.isLocalAddress("127.0.0.1")).toBe(true);
    expect(runtimeDesktopInternal.isLocalAddress("::1")).toBe(true);
    expect(runtimeDesktopInternal.isLocalAddress("::ffff:127.0.0.1")).toBe(true);
    expect(runtimeDesktopInternal.isLocalAddress("10.0.0.2")).toBe(false);
  });
});
