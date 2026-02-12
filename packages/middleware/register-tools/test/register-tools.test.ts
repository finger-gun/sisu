import { test, expect } from "vitest";
import type { Ctx, Tool } from "@sisu-ai/core";
import { InMemoryKV, NullStream, SimpleTools, compose } from "@sisu-ai/core";
import { registerTools } from "../src/index.js";

function makeCtx(): Ctx {
  const ac = new AbortController();
  return {
    input: "",
    messages: [],
    model: {
      name: "dummy",
      capabilities: {},
      async generate() {
        return { message: { role: "assistant", content: "" } };
      },
    },
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
}

test("registerTools registers provided tools", async () => {
  const tools: Tool[] = [
    {
      name: "a",
      schema: {},
      async handler() {
        return 1;
      },
    } as any,
    {
      name: "b",
      schema: {},
      async handler() {
        return 2;
      },
    } as any,
  ];
  const ctx = makeCtx();
  await compose([registerTools(tools)])(ctx);
  expect(ctx.tools.get("a")).toBeTruthy();
  expect(ctx.tools.get("b")).toBeTruthy();
});

test("registerTools stores aliases in ctx.state.toolAliases", async () => {
  const tools: Tool[] = [
    {
      name: "terminalRun",
      schema: {},
      async handler() {
        return "ok";
      },
    } as any,
    {
      name: "terminalReadFile",
      schema: {},
      async handler() {
        return "ok";
      },
    } as any,
  ];
  const ctx = makeCtx();
  await compose([
    registerTools(tools, {
      aliases: {
        terminalRun: "bash",
        terminalReadFile: "read_file",
      },
    }),
  ])(ctx);

  // Tools should be registered with canonical names
  expect(ctx.tools.get("terminalRun")).toBeTruthy();
  expect(ctx.tools.get("terminalReadFile")).toBeTruthy();

  // Aliases should be stored in state
  const aliasMap = ctx.state.toolAliases as Map<string, string>;
  expect(aliasMap).toBeDefined();
  expect(aliasMap.get("terminalRun")).toBe("bash");
  expect(aliasMap.get("terminalReadFile")).toBe("read_file");
});

test("registerTools works without aliases (backward compatibility)", async () => {
  const tools: Tool[] = [
    {
      name: "echo",
      schema: {},
      async handler() {
        return "ok";
      },
    } as any,
  ];
  const ctx = makeCtx();
  await compose([registerTools(tools)])(ctx);

  expect(ctx.tools.get("echo")).toBeTruthy();
  // No aliases should be stored
  expect(ctx.state.toolAliases).toBeUndefined();
});

test("registerTools validates that aliased tools exist", async () => {
  const tools: Tool[] = [
    {
      name: "echo",
      schema: {},
      async handler() {
        return "ok";
      },
    } as any,
  ];
  const ctx = makeCtx();

  // Mock log.warn to capture warning
  let warnCalled = false;
  ctx.log.warn = () => {
    warnCalled = true;
  };

  // Try to alias a tool that doesn't exist - should warn but not throw
  await compose([
    registerTools(tools, {
      aliases: {
        nonExistentTool: "bash",
      },
    }),
  ])(ctx);

  expect(warnCalled).toBe(true);
});

test("registerTools handles empty alias map", async () => {
  const tools: Tool[] = [
    {
      name: "echo",
      schema: {},
      async handler() {
        return "ok";
      },
    } as any,
  ];
  const ctx = makeCtx();
  await compose([registerTools(tools, { aliases: {} })])(ctx);

  expect(ctx.tools.get("echo")).toBeTruthy();
  // Empty alias map should not be stored
  const aliasMap = ctx.state.toolAliases as Map<string, string> | undefined;
  expect(aliasMap).toBeUndefined();
});
