import { test, expect } from "vitest";
import { compose } from "../src/compose.js";
import {
  execute,
  executeStream,
  executeWith,
  getExecutionEvents,
  getExecutionResult,
  InMemoryKV,
  NullStream,
  SimpleTools,
} from "../src/util.js";
import type { Ctx, GenerateOptions, Message, ModelEvent, Tool } from "../src/types.js";

function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  const ac = new AbortController();
  const base: Ctx = {
    input: "",
    messages: [],
    model: {
      name: "dummy",
      capabilities: { functionCall: true, streaming: true },
      generate: async () =>
        ({ message: { role: "assistant", content: "" } }) as unknown as never,
    } as Ctx["model"],
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
  return Object.assign(base, partial);
}

test("execute middleware defaults to toolChoice auto when tools are registered", async () => {
  let firstOptions: GenerateOptions | undefined;
  const echo: Tool = {
    name: "echo",
    schema: {},
    handler: async () => ({ ok: true }),
  };
  const tools = new SimpleTools();
  tools.register(echo);

  const ctx = makeCtx({
    tools,
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: Message[], opts?: GenerateOptions) => {
        if (!firstOptions) firstOptions = opts;
        return { message: { role: "assistant", content: "hello" } };
      },
    } as Ctx["model"],
  });

  await compose([execute])(ctx);
  const result = getExecutionResult(ctx);
  expect(firstOptions?.toolChoice).toBe("auto");
  expect(firstOptions?.tools?.map((t) => t.name)).toEqual(["echo"]);
  expect(result?.text).toBe("hello");
});

test("executeWith({strategy:'single'}) runs tool round and stores result", async () => {
  const weather: Tool<{ city: string }> = {
    name: "getWeather",
    schema: { parse: (value: unknown) => value as { city: string } },
    handler: async ({ city }) => ({ city, tempC: 21 }),
  };
  const tools = new SimpleTools();
  tools.register(weather);

  let calls = 0;
  const ctx = makeCtx({
    tools,
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: Message[], opts?: GenerateOptions) => {
        calls += 1;
        if (opts?.toolChoice !== "none" && calls === 1) {
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "call-1", name: "getWeather", arguments: { city: "Malmö" } },
              ],
            },
          };
        }
        return { message: { role: "assistant", content: "It is sunny." } };
      },
    } as Ctx["model"],
  });

  await compose([executeWith({ strategy: "single" })])(ctx);
  const result = getExecutionResult(ctx);
  expect(result?.text).toBe("It is sunny.");
  expect(result?.toolExecutions).toHaveLength(1);
  expect(result?.toolExecutions[0]?.canonicalName).toBe("getWeather");
});

test("executeStream middleware emits events and stores them in ctx.state", async () => {
  const echo: Tool<{ text: string }> = {
    name: "echo",
    schema: { parse: (value: unknown) => value as { text: string } },
    handler: async ({ text }) => ({ echoed: text }),
  };
  const tools = new SimpleTools();
  tools.register(echo);

  let phase = 0;
  const sinkWrites: string[] = [];
  const ctx = makeCtx({
    tools,
    stream: {
      write: (token: string) => sinkWrites.push(token),
      end: () => sinkWrites.push("<END>"),
    },
    model: {
      name: "dummy",
      capabilities: { functionCall: true, streaming: true },
      generate: async (_messages: Message[], opts?: GenerateOptions) => {
        if (opts?.stream) {
          async function* events(): AsyncGenerator<ModelEvent> {
            yield { type: "token", token: "A" };
            yield { type: "token", token: "B" };
            yield {
              type: "assistant_message",
              message: { role: "assistant", content: "AB" },
            };
          }
          return events();
        }
        if (phase === 0) {
          phase += 1;
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "1", name: "echo", arguments: { text: "x" } }],
            },
          };
        }
        return { message: { role: "assistant", content: "candidate" } };
      },
    } as Ctx["model"],
  });

  await compose([executeStream])(ctx);
  const events = getExecutionEvents(ctx).map((event) => event.type);
  expect(events).toContain("tool_call_started");
  expect(events).toContain("tool_call_finished");
  expect(events).toContain("assistant_message");
  expect(events).toContain("done");
  expect(sinkWrites.join("")).toContain("AB");
  expect(getExecutionResult(ctx)?.text).toBe("AB");
});

test("executeStream middleware surfaces cancellation and stores error event", async () => {
  const ac = new AbortController();
  ac.abort();
  const ctx = makeCtx({ signal: ac.signal });

  await expect(compose([executeStream])(ctx)).rejects.toThrow("EXECUTION_CANCELLED");
  const events = getExecutionEvents(ctx);
  expect(events.some((event) => event.type === "error")).toBe(true);
});
