import { describe, expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  branchThreadRequestSchema,
  chatGenerateRequestSchema,
  parseRuntimeStreamEvent,
  parseSetThreadModelOverrideRequest,
  providerCatalogResponseSchema,
  setThreadModelOverrideRequestSchema,
  threadListResponseSchema,
  runtimeErrorSchema,
  runtimeHealthResponseSchema,
  runtimeStreamTerminalEventSchema,
} from "../src/index.js";

describe("protocol contracts", () => {
  test("chat request validates required fields", () => {
    expect(
      chatGenerateRequestSchema.safeParse({
        prompt: "Hello",
        modelId: "gpt-4o-mini",
      }).success,
    ).toBe(true);

    const missingPrompt = chatGenerateRequestSchema.safeParse({
      modelId: "gpt-4o-mini",
    });
    expect(missingPrompt.success).toBe(false);
  });

  test("chat request supports retry and image attachments", () => {
    const parsed = chatGenerateRequestSchema.safeParse({
      threadId: "t1",
      prompt: "describe image",
      modelId: "gpt-4o-mini",
      retryOfMessageId: "m1",
      attachments: [
        {
          type: "image",
          mimeType: "image/png",
          data: "base64-blob",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  test("health payload validates degraded capabilities and version", () => {
    const parsed = runtimeHealthResponseSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      state: "degraded",
      degradedCapabilities: ["imageInput"],
      dependencies: [{ id: "ollama", status: "failed", reason: "offline" }],
    });

    expect(parsed.success).toBe(true);
  });

  test("provider catalog requires normalized capability metadata", () => {
    const parsed = providerCatalogResponseSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      providers: [
        {
          providerId: "openai",
          displayName: "OpenAI",
          models: [
            {
              providerId: "openai",
              modelId: "gpt-4o-mini",
              displayName: "GPT-4o mini",
              capabilities: {
                streaming: true,
                imageInput: true,
                toolCalling: true,
                contextWindow: 128000,
              },
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  test("stream parser accepts token events", () => {
    const ev = parseRuntimeStreamEvent({
      type: "token.delta",
      streamId: "s1",
      messageId: "m1",
      ts: "2026-03-29T00:00:00.000Z",
      correlationId: "corr-1",
      index: 0,
      delta: "Hello",
    });

    expect(ev.type).toBe("token.delta");
  });

  test("terminal event union accepts completed/failed/cancelled", () => {
    const completed = runtimeStreamTerminalEventSchema.safeParse({
      type: "message.completed",
      streamId: "s1",
      messageId: "m1",
      ts: "2026-03-29T00:00:00.000Z",
      text: "done",
    });
    expect(completed.success).toBe(true);

    const failed = runtimeStreamTerminalEventSchema.safeParse({
      type: "message.failed",
      streamId: "s1",
      messageId: "m1",
      ts: "2026-03-29T00:00:00.000Z",
      error: { code: "internal_error", message: "boom" },
    });
    expect(failed.success).toBe(true);

    const cancelled = runtimeStreamTerminalEventSchema.safeParse({
      type: "message.cancelled",
      streamId: "s1",
      messageId: "m1",
      ts: "2026-03-29T00:00:00.000Z",
    });
    expect(cancelled.success).toBe(true);
  });

  test("runtime error schema enforces stable error code", () => {
    const valid = runtimeErrorSchema.safeParse({
      code: "model_unavailable",
      message: "Model is not available",
    });
    expect(valid.success).toBe(true);

    const invalid = runtimeErrorSchema.safeParse({
      code: "custom_error",
      message: "not allowed",
    });
    expect(invalid.success).toBe(false);
  });

  test("protocol version marker is stable", () => {
    expect(PROTOCOL_VERSION).toBe("2026-03-29");
  });

  test("thread list validates pagination and message metadata", () => {
    const parsed = threadListResponseSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      items: [
        {
          threadId: "t1",
          title: "Demo",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
          messageCount: 1,
          providerId: "openai",
          modelId: "gpt-4o-mini",
        },
      ],
      page: { nextCursor: "cursor-1" },
    });
    expect(parsed.success).toBe(true);
  });

  test("set thread model override parser validates required fields", () => {
    const parsed = parseSetThreadModelOverrideRequest({
      providerId: "anthropic",
      modelId: "claude-sonnet-4",
    });
    expect(parsed.providerId).toBe("anthropic");
    expect(parsed.modelId).toBe("claude-sonnet-4");
    expect(
      setThreadModelOverrideRequestSchema.safeParse({ providerId: "x" }).success,
    ).toBe(false);
  });

  test("branch thread request requires source message id", () => {
    expect(
      branchThreadRequestSchema.safeParse({ sourceMessageId: "m42" }).success,
    ).toBe(true);
    expect(branchThreadRequestSchema.safeParse({}).success).toBe(false);
  });
});
