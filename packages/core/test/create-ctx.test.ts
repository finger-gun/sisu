import { test, expect } from 'vitest';
import { createCtx, InMemoryKV, NullStream, SimpleTools } from '../src/util.js';
import type { LLM, Tool, ToolRegistry } from '../src/types.js';

const mockLLM = {
  name: 'mock-llm',
  capabilities: { functionCall: false, streaming: false },
  generate: async () => ({ message: { role: 'assistant', content: 'test' } }),
} as unknown as LLM;

test('createCtx requires model parameter', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.model).toBe(mockLLM);
});

test('createCtx creates empty messages array by default', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.messages).toEqual([]);
});

test('createCtx adds system message when systemPrompt provided', () => {
  const ctx = createCtx({
    model: mockLLM,
    systemPrompt: 'You are a helpful assistant',
  });
  expect(ctx.messages).toHaveLength(1);
  expect(ctx.messages[0]).toEqual({
    role: 'system',
    content: 'You are a helpful assistant',
  });
});

test('createCtx sets input when provided', () => {
  const ctx = createCtx({
    model: mockLLM,
    input: 'Hello, world!',
  });
  expect(ctx.input).toBe('Hello, world!');
});

test('createCtx uses default InMemoryKV for memory', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.memory).toBeInstanceOf(InMemoryKV);
});

test('createCtx accepts custom memory', async () => {
  const customMemory = new InMemoryKV();
  await customMemory.set('test', 'value');
  const ctx = createCtx({ model: mockLLM, memory: customMemory });
  expect(ctx.memory).toBe(customMemory);
  expect(await ctx.memory.get('test')).toBe('value');
});

test('createCtx uses default NullStream for stream', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.stream).toBeInstanceOf(NullStream);
});

test('createCtx accepts custom stream', () => {
  const customStream = {
    write: () => {},
    end: () => {},
  };
  const ctx = createCtx({ model: mockLLM, stream: customStream });
  expect(ctx.stream).toBe(customStream);
});

test('createCtx creates empty state by default', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.state).toEqual({});
});

test('createCtx accepts initial state', () => {
  const ctx = createCtx({
    model: mockLLM,
    state: { foo: 'bar', count: 42 },
  });
  expect(ctx.state).toEqual({ foo: 'bar', count: 42 });
});

test('createCtx creates default AbortController signal', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.signal).toBeInstanceOf(AbortSignal);
  expect(ctx.signal.aborted).toBe(false);
});

test('createCtx accepts custom signal', () => {
  const controller = new AbortController();
  const ctx = createCtx({ model: mockLLM, signal: controller.signal });
  expect(ctx.signal).toBe(controller.signal);
});

test('createCtx creates logger with default info level', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.log).toBeDefined();
  expect(typeof ctx.log.debug).toBe('function');
  expect(typeof ctx.log.info).toBe('function');
  expect(typeof ctx.log.warn).toBe('function');
  expect(typeof ctx.log.error).toBe('function');
});

test('createCtx accepts custom log level', () => {
  const ctx = createCtx({ model: mockLLM, logLevel: 'debug' });
  expect(ctx.log).toBeDefined();
});

test('createCtx accepts timestamps option for logger', () => {
  const ctx = createCtx({ model: mockLLM, timestamps: false });
  expect(ctx.log).toBeDefined();
});

test('createCtx creates empty SimpleTools registry by default', () => {
  const ctx = createCtx({ model: mockLLM });
  expect(ctx.tools).toBeInstanceOf(SimpleTools);
  expect(ctx.tools.list()).toEqual([]);
});

test('createCtx accepts array of tools', () => {
  const tool1: Tool = {
    name: 'tool1',
    description: 'Test tool 1',
    schema: {},
    handler: async () => ({ result: 'ok' }),
  };
  const tool2: Tool = {
    name: 'tool2',
    description: 'Test tool 2',
    schema: {},
    handler: async () => ({ result: 'ok' }),
  };
  const ctx = createCtx({ model: mockLLM, tools: [tool1, tool2] });
  expect(ctx.tools.list()).toHaveLength(2);
  expect(ctx.tools.get('tool1')).toBe(tool1);
  expect(ctx.tools.get('tool2')).toBe(tool2);
});

test('createCtx accepts ToolRegistry instance', () => {
  const registry = new SimpleTools();
  const tool: Tool = {
    name: 'custom-tool',
    description: 'Custom tool',
    schema: {},
    handler: async () => ({ result: 'ok' }),
  };
  registry.register(tool);
  const ctx = createCtx({ model: mockLLM, tools: registry });
  expect(ctx.tools).toBe(registry);
  expect(ctx.tools.list()).toHaveLength(1);
  expect(ctx.tools.get('custom-tool')).toBe(tool);
});

test('createCtx combines all options correctly', () => {
  const tool: Tool = {
    name: 'test-tool',
    description: 'Test tool',
    schema: {},
    handler: async () => ({ result: 'ok' }),
  };
  const customMemory = new InMemoryKV();
  const controller = new AbortController();
  
  const ctx = createCtx({
    model: mockLLM,
    input: 'Test input',
    systemPrompt: 'System message',
    logLevel: 'warn',
    timestamps: false,
    signal: controller.signal,
    tools: [tool],
    memory: customMemory,
    state: { key: 'value' },
  });
  
  expect(ctx.model).toBe(mockLLM);
  expect(ctx.input).toBe('Test input');
  expect(ctx.messages).toHaveLength(1);
  expect(ctx.messages[0].role).toBe('system');
  expect(ctx.tools.list()).toHaveLength(1);
  expect(ctx.memory).toBe(customMemory);
  expect(ctx.state).toEqual({ key: 'value' });
  expect(ctx.signal).toBe(controller.signal);
  expect(ctx.log).toBeDefined();
});

test('createCtx stream is functional', () => {
  const ctx = createCtx({ model: mockLLM });
  // Should not throw
  ctx.stream.write('test');
  ctx.stream.end();
  expect(true).toBe(true);
});

test('createCtx memory is functional', async () => {
  const ctx = createCtx({ model: mockLLM });
  await ctx.memory.set('key', 'value');
  const result = await ctx.memory.get('key');
  expect(result).toBe('value');
});