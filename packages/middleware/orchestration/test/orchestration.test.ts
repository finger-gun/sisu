import { expect, test } from "vitest";
import {
  compose,
  InMemoryKV,
  NullStream,
  SimpleTools,
  type Ctx,
  type LLM,
  type Message,
  type ModelResponse,
  type Tool,
} from "@sisu-ai/core";
import {
  createInlineChildExecutor,
  orchestration,
  type ChildExecutionRequest,
  type DelegationResult,
} from "../src/index.js";

function makeCtx(model: LLM): Ctx {
  const ac = new AbortController();
  return {
    input: "Solve task",
    messages: [{ role: "user", content: "Solve task" }],
    model,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
}

function response(message: Message): Promise<ModelResponse> {
  return Promise.resolve({ message: message as ModelResponse["message"] });
}

test("orchestration completes on finish control action", async () => {
  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () =>
      response({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "finish-1",
            name: "finish",
            arguments: { answer: "done" },
          },
        ],
      }),
  };
  const ctx = makeCtx(model);
  await compose([orchestration()])(ctx);
  const last = ctx.messages[ctx.messages.length - 1];
  expect(last?.role).toBe("assistant");
  expect(last?.content).toBe("done");
});

test("orchestration rejects unsupported control tools", async () => {
  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () =>
      response({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "bad-1",
            name: "getWeather",
            arguments: {},
          },
        ],
      }),
  };
  const ctx = makeCtx(model);
  await expect(compose([orchestration()])(ctx)).rejects.toThrow(
    /unsupported control tool call/,
  );
});

test("orchestration captures delegate validation failures", async () => {
  let calls = 0;
  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () => {
      calls += 1;
      if (calls === 1) {
        return response({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "delegate-1",
              name: "delegateTask",
              arguments: { instruction: "missing fields" },
            },
          ],
        });
      }
      return response({
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "finish-1", name: "finish", arguments: { answer: "done" } },
        ],
      });
    },
  };
  const ctx = makeCtx(model);
  await compose([orchestration()])(ctx);
  const toolMessages = ctx.messages.filter((m) => m.role === "tool");
  expect(toolMessages.length).toBe(1);
  expect(String(toolMessages[0]?.content)).toContain("SCHEMA_INVALID");
  expect(String(toolMessages[0]?.content)).toContain("hint");
});

test("orchestration normalizes delegation payload using defaults", async () => {
  let calls = 0;
  const childExecutor = async (
    req: ChildExecutionRequest,
  ): Promise<DelegationResult> => ({
    delegationId: req.delegationId,
    status: "ok",
    output: { summary: "ok" },
    telemetry: {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1,
      model: req.input.model?.name ?? "",
      toolsAllowed: req.input.tools.allow,
      toolsUsed: [],
    },
    trace: { runId: "child", parentRunId: "parent" },
  });

  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () => {
      calls += 1;
      if (calls === 1) {
        return response({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "delegate-1",
              name: "delegateTask",
              arguments: {
                instruction: "use default model and normalize tools",
                tools: "echo",
              },
            },
          ],
        });
      }
      return response({
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "finish-1", name: "finish", arguments: { answer: "done" } },
        ],
      });
    },
  };

  const ctx = makeCtx(model);
  ctx.tools.register({
    name: "echo",
    schema: { parse: (v: unknown) => v },
    handler: async () => ({ ok: true }),
  } as Tool);
  await compose([orchestration({ childExecutor })])(ctx);

  const toolResult = ctx.messages.find((m) => m.role === "tool");
  expect(String(toolResult?.content)).toContain('"toolsAllowed":["echo"]');
  expect(String(toolResult?.content)).toContain('"model":"gpt-4o-mini"');
});

test("orchestration enforces correction retry budget", async () => {
  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () =>
      response({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "delegate-1",
            name: "delegateTask",
            arguments: { instruction: "invalid forever" },
          },
        ],
      }),
  };

  const ctx = makeCtx(model);
  await expect(
    compose([orchestration({ maxCorrectionRetries: 1, maxDelegations: 5 })])(ctx),
  ).rejects.toThrow(/correction retries exceeded/);
});

test("orchestration uses custom child executor", async () => {
  let seen = false;
  const childExecutor = async (
    req: ChildExecutionRequest,
  ): Promise<DelegationResult> => {
    seen = true;
    return {
      delegationId: req.delegationId,
      status: "ok",
      output: { summary: "child", answer: "child answer" },
      telemetry: {
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 1,
        model: req.input.model.name,
        toolsAllowed: req.input.tools.allow,
        toolsUsed: [],
      },
      trace: { runId: "child-run", parentRunId: "parent-run" },
    };
  };
  let calls = 0;
  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () => {
      calls += 1;
      if (calls === 1) {
        return response({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "delegate-1",
              name: "delegateTask",
              arguments: {
                instruction: "child task",
                context: {},
                tools: { allow: ["echo"] },
                model: { name: "gpt-4o-mini" },
              },
            },
          ],
        });
      }
      return response({
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "finish-1", name: "finish", arguments: { answer: "done" } },
        ],
      });
    },
  };
  const ctx = makeCtx(model);
  const echo: Tool = {
    name: "echo",
    schema: { parse: (v: unknown) => v },
    handler: async () => ({ ok: true }),
  };
  ctx.tools.register(echo);
  await compose([orchestration({ childExecutor })])(ctx);
  expect(seen).toBe(true);
});

test("inline child executor validates model and tools", async () => {
  const parentModel: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () => response({ role: "assistant", content: "ok" }),
  };
  const ctx = makeCtx(parentModel);
  const executor = createInlineChildExecutor({
    defaultTimeoutMs: 200,
    maxChildTurns: 2,
    allowedModels: ["gpt-4o-mini"],
  });

  await expect(
    executor(
      {
        delegationId: "d1",
        input: {
          instruction: "task",
          context: {},
          tools: { allow: ["missingTool"] },
          model: { name: "gpt-4o-mini" },
        },
      },
      ctx,
    ),
  ).rejects.toThrow(/unknown delegated tool/);
});

test("inline child executor runs child tools and returns usage", async () => {
  let generation = 0;
  const parentModel: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () => {
      generation += 1;
      if (generation === 1) {
        return response({
          role: "assistant",
          content: "",
          tool_calls: [{ id: "t1", name: "echo", arguments: { text: "x" } }],
        });
      }
      return response({ role: "assistant", content: "child done" });
    },
  };
  const ctx = makeCtx(parentModel);
  ctx.state.usage = { totalTokens: 15, promptTokens: 10, completionTokens: 5 };
  const echo: Tool = {
    name: "echo",
    schema: { parse: (input: unknown) => input },
    handler: async () => ({ ok: true }),
  };
  ctx.tools.register(echo);

  const executor = createInlineChildExecutor({
    defaultTimeoutMs: 300,
    maxChildTurns: 3,
    allowedModels: ["gpt-4o-mini"],
  });

  const result = await executor(
    {
      delegationId: "d2",
      input: {
        instruction: "do work",
        context: {},
        tools: { allow: ["echo"] },
        model: { name: "gpt-4o-mini" },
      },
    },
    ctx,
  );

  expect(result.status).toBe("ok");
  expect(result.telemetry.toolsUsed).toEqual(["echo"]);
  expect(result.output?.summary).toContain("child done");
  expect(result.telemetry.usage?.totalTokens).toBe(15);
});

test("orchestration stops when aborted", async () => {
  const ac = new AbortController();
  ac.abort();
  const model: LLM = {
    name: "gpt-4o-mini",
    capabilities: { functionCall: true },
    generate: async () => response({ role: "assistant", content: "done" }),
  };
  const ctx = makeCtx(model);
  ctx.signal = ac.signal;
  await compose([orchestration()])(ctx);
  const orchestrationState = ctx.state.orchestration as { status: string };
  expect(orchestrationState.status).toBe("aborted");
});
