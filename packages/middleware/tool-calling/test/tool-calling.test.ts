import { test, expect } from "vitest";
import type { Ctx, Tool } from "@sisu-ai/core";
import { InMemoryKV, NullStream, SimpleTools, compose } from "@sisu-ai/core";
import { toolCalling, iterativeToolCalling } from "../src/index.js";

function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  const ac = new AbortController();
  const base: Ctx = {
    input: "",
    messages: [],
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async () =>
        ({ message: { role: "assistant", content: "" } }) as any,
    } as any,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
  return Object.assign(base, partial);
}

test("tool-calling executes tools then appends final assistant message", async () => {
  const echo: Tool<{ text: string }> = {
    name: "echo",
    schema: { parse: (x: any) => x },
    handler: async ({ text }: { text: string }) => ({ echoed: text }),
  } as any;

  let callCount = 0;
  const ctx = makeCtx({
    tools: (() => {
      const r = new SimpleTools();
      r.register(echo);
      return r;
    })(),
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (messages: any[], opts: any) => {
        callCount++;
        // First pass: request tool
        if (opts.toolChoice !== "none") {
          return {
            message: {
              role: "assistant",
              content: "Using a tool",
              tool_calls: [
                { id: "1", name: "echo", arguments: { text: "hi" } },
              ],
            },
          } as any;
        }
        // Second pass: respond normally
        const last = messages[messages.length - 1];
        if (last?.role === "tool") {
          return { message: { role: "assistant", content: "done" } } as any;
        }
        return { message: { role: "assistant", content: "unexpected" } } as any;
      },
    } as any,
  });

  await compose([toolCalling])(ctx);
  const last = ctx.messages[ctx.messages.length - 1];
  expect(last.role).toBe("assistant");
  expect(last.content).toBe("done");
  // Expect sequence: assistant(tool_calls), tool result, assistant(final)
  expect(
    ctx.messages.some(
      (m: any) => m.role === "tool" && /echoed/.test(String(m.content)),
    ),
  ).toBe(true);
  expect(callCount >= 2).toBe(true);
});

test("tool-calling caches duplicate calls for identical name+args", async () => {
  let handlerCalls = 0;
  const echo: Tool<{ text: string }> = {
    name: "echo",
    schema: { parse: (x: any) => x },
    handler: async ({ text }: { text: string }) => {
      handlerCalls++;
      return { echoed: text };
    },
  } as any;

  const tools = new SimpleTools();
  tools.register(echo);

  const ctx = makeCtx({
    tools,
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], opts: any) => {
        if (opts.toolChoice !== "none") {
          // Two identical calls with same args; second should reuse cached result
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "1", name: "echo", arguments: { text: "hi" } },
                { id: "2", name: "echo", arguments: { text: "hi" } },
              ],
            },
          } as any;
        }
        return { message: { role: "assistant", content: "ok" } } as any;
      },
    } as any,
  });

  await compose([toolCalling])(ctx);
  // Handler called once due to caching identical (name,args)
  expect(handlerCalls).toBe(1);
  // But two tool messages appended (one per tool_call id)
  const toolMsgs = ctx.messages.filter((m: any) => m.role === "tool");
  expect(toolMsgs.length).toBe(2);
});

test("tool-calling appends assistant when no tool_calls present", async () => {
  const ctx = makeCtx({
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], _opts: any) => {
        return { message: { role: "assistant", content: "plain" } } as any;
      },
    } as any,
  });
  await compose([toolCalling])(ctx);
  const last = ctx.messages.at(-1) as any;
  expect(last?.content).toBe("plain");
});

test("iterativeToolCalling supports multiple tool rounds", async () => {
  let phase = 0;
  const echo: Tool<{ text: string }> = {
    name: "echo",
    schema: { parse: (x: any) => x },
    handler: async ({ text }: { text: string }) => ({ echoed: text }),
  } as any;
  const tools = new SimpleTools();
  tools.register(echo);
  const ctx = makeCtx({
    tools,
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], _opts: any) => {
        if (phase === 0) {
          phase++;
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "1", name: "echo", arguments: { text: "a" } }],
            },
          } as any;
        }
        if (phase === 1) {
          phase++;
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "2", name: "echo", arguments: { text: "b" } }],
            },
          } as any;
        }
        return { message: { role: "assistant", content: "done-2" } } as any;
      },
    } as any,
  });
  await compose([iterativeToolCalling])(ctx);
  const last = ctx.messages.at(-1) as any;
  expect(last?.content).toBe("done-2");
  const toolMsgs = ctx.messages.filter((m: any) => m.role === "tool");
  expect(toolMsgs.length).toBe(2);
});

test("tool-calling provides restricted ToolContext to handlers", async () => {
  let receivedCtx: any;
  const inspector: Tool<{ msg: string }> = {
    name: "inspector",
    schema: { parse: (x: any) => x },
    async handler({ msg }: { msg: string }, ctx: any) {
      receivedCtx = ctx;
      return { inspected: msg };
    },
  } as any;

  const tools = new SimpleTools();
  tools.register(inspector);

  const ctx = makeCtx({
    tools,
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], opts: any) => {
        if (opts.toolChoice !== "none") {
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "1", name: "inspector", arguments: { msg: "test" } },
              ],
            },
          } as any;
        }
        return { message: { role: "assistant", content: "done" } } as any;
      },
    } as any,
  });

  await compose([toolCalling])(ctx);

  // Verify tool received ToolContext properties
  expect(receivedCtx).toBeDefined();
  expect(receivedCtx.memory).toBeDefined();
  expect(receivedCtx.signal).toBeDefined();
  expect(receivedCtx.log).toBeDefined();
  expect(receivedCtx.model).toBeDefined();

  // Verify tool did NOT receive full Ctx properties (sandboxing)
  expect(receivedCtx.messages).toBeUndefined();
  expect(receivedCtx.tools).toBeUndefined();
  expect(receivedCtx.state).toBeUndefined();
  expect(receivedCtx.input).toBeUndefined();
  expect(receivedCtx.stream).toBeUndefined();
});

test("tool-calling resolves tool aliases to canonical names", async () => {
  const echo: Tool<{ text: string }> = {
    name: "terminalRun",
    schema: { parse: (x: any) => x },
    handler: async ({ text }: { text: string }) => ({ echoed: text }),
  } as any;

  const tools = new SimpleTools();
  tools.register(echo);

  // Configure aliases via ctx.state (simulating registerTools middleware)
  const aliasMap = new Map<string, string>();
  aliasMap.set("terminalRun", "bash");

  const ctx = makeCtx({
    tools,
    state: { toolAliases: aliasMap },
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], opts: any) => {
        // Verify adapter receives aliased tool name
        if (opts.toolChoice !== "none" && opts.tools) {
          const toolNames = opts.tools.map((t: any) => t.name);
          expect(toolNames).toContain("bash");
          expect(toolNames).not.toContain("terminalRun");
        }

        if (opts.toolChoice !== "none") {
          // Model calls tool using alias 'bash' instead of canonical 'terminalRun'
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "1", name: "bash", arguments: { text: "hi" } },
              ],
            },
          } as any;
        }
        return { message: { role: "assistant", content: "done" } } as any;
      },
    } as any,
  });

  await compose([toolCalling])(ctx);
  const last = ctx.messages[ctx.messages.length - 1];
  expect(last.role).toBe("assistant");
  expect(last.content).toBe("done");
  // Verify tool was executed even though called via alias
  expect(
    ctx.messages.some(
      (m: any) => m.role === "tool" && /echoed/.test(String(m.content)),
    ),
  ).toBe(true);
});

test("tool-calling works without aliases (backward compatibility)", async () => {
  const echo: Tool<{ text: string }> = {
    name: "echo",
    schema: { parse: (x: any) => x },
    handler: async ({ text }: { text: string }) => ({ echoed: text }),
  } as any;

  const tools = new SimpleTools();
  tools.register(echo);

  // No aliases configured - should work normally
  const ctx = makeCtx({
    tools,
    state: {}, // No toolAliases
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], opts: any) => {
        // Verify adapter receives original tool name
        if (opts.toolChoice !== "none" && opts.tools) {
          const toolNames = opts.tools.map((t: any) => t.name);
          expect(toolNames).toContain("echo");
        }

        if (opts.toolChoice !== "none") {
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "1", name: "echo", arguments: { text: "hi" } },
              ],
            },
          } as any;
        }
        return { message: { role: "assistant", content: "done" } } as any;
      },
    } as any,
  });

  await compose([toolCalling])(ctx);
  const last = ctx.messages[ctx.messages.length - 1];
  expect(last.role).toBe("assistant");
  expect(last.content).toBe("done");
  expect(
    ctx.messages.some(
      (m: any) => m.role === "tool" && /echoed/.test(String(m.content)),
    ),
  ).toBe(true);
});

test("tool-calling supports partial aliasing (some tools aliased, some not)", async () => {
  const echo: Tool<{ text: string }> = {
    name: "echo",
    schema: { parse: (x: any) => x },
    handler: async ({ text }: { text: string }) => ({ echoed: text }),
  } as any;

  const run: Tool<{ cmd: string }> = {
    name: "terminalRun",
    schema: { parse: (x: any) => x },
    handler: async ({ cmd }: { cmd: string }) => ({ output: "ok" }),
  } as any;

  const tools = new SimpleTools();
  tools.register(echo);
  tools.register(run);

  // Only alias terminalRun, not echo
  const aliasMap = new Map<string, string>();
  aliasMap.set("terminalRun", "bash");

  const ctx = makeCtx({
    tools,
    state: { toolAliases: aliasMap },
    model: {
      name: "dummy",
      capabilities: { functionCall: true },
      generate: async (_messages: any[], opts: any) => {
        if (opts.toolChoice !== "none" && opts.tools) {
          const toolNames = opts.tools.map((t: any) => t.name);
          // bash aliased, echo not
          expect(toolNames).toContain("bash");
          expect(toolNames).toContain("echo");
          expect(toolNames).not.toContain("terminalRun");
        }

        if (opts.toolChoice !== "none") {
          return {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "1", name: "bash", arguments: { cmd: "ls" } },
                { id: "2", name: "echo", arguments: { text: "hi" } },
              ],
            },
          } as any;
        }
        return { message: { role: "assistant", content: "done" } } as any;
      },
    } as any,
  });

  await compose([toolCalling])(ctx);
  const toolMsgs = ctx.messages.filter((m: any) => m.role === "tool");
  expect(toolMsgs.length).toBe(2);
});
