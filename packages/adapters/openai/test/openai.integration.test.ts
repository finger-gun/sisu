import { test, expect } from 'vitest';
import { openAIAdapter } from '../src/index.js';

/**
 * Integration tests for OpenAI adapter reasoning support
 *
 * These tests require real API keys and are skipped by default.
 *
 * To run with OpenAI or OpenRouter:
 *   OPENAI_API_KEY=sk-... npm test packages/adapters/openai/test/openai.integration.test.ts
 *
 * For OpenRouter, also set:
 *   OPENAI_BASE_URL=https://openrouter.ai/api/
 *
 * These tests use gpt-5.1 which is available on both OpenAI and OpenRouter.
 */

const skipIfNoKey = !process.env.OPENAI_API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';

test.skipIf(skipIfNoKey)('real API: gpt-5.1 with reasoning', async () => {
  const llm = openAIAdapter({
    model: 'gpt-5.1',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl
  });
  
  const res = await llm.generate([
    { role: 'user', content: 'How many times does the letter "r" appear in "strawberry"? Think step by step.' }
  ], { reasoning: true });
  
  expect(res.message.role).toBe('assistant');
  expect(res.message.content).toBeTruthy();
  expect(res.message.reasoning_details).toBeDefined();
  
  console.log('Response:', res.message.content);
  console.log('Reasoning details present:', !!res.message.reasoning_details);
}, { timeout: 60000 }); // 60s timeout for reasoning models

test.skipIf(skipIfNoKey)('real API: multi-turn reasoning preservation', async () => {
  const llm = openAIAdapter({
    model: 'gpt-5.1',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl
  });
  
  // First turn
  const res1 = await llm.generate([
    { role: 'user', content: 'What is the capital of France?' }
  ], { reasoning: true });
  
  expect(res1.message.reasoning_details).toBeDefined();
  const reasoningDetails1 = res1.message.reasoning_details;
  
  // Second turn - preserve reasoning context
  const messages: any[] = [
    { role: 'user', content: 'What is the capital of France?' },
    res1.message, // Includes reasoning_details
    { role: 'user', content: 'What language is spoken there?' }
  ];
  
  const res2 = await llm.generate(messages as any, { reasoning: true });
  
  expect(res2.message.content).toBeTruthy();
  expect(res2.message.content.toLowerCase()).toContain('french');
  
  // Reasoning details should be present in follow-up
  expect(res2.message.reasoning_details).toBeDefined();
  
  console.log('Turn 1 reasoning:', !!reasoningDetails1);
  console.log('Turn 2 reasoning:', !!res2.message.reasoning_details);
}, { timeout: 90000 });

test.skipIf(skipIfNoKey)('real API: streaming mode works', async () => {
  const llm = openAIAdapter({
    model: 'gpt-5.1',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl
  });
  
  const events: any[] = [];
  const stream = (llm.generate([
    { role: 'user', content: 'Count to 3' }
  ], { stream: true }) as unknown) as AsyncIterable<any>;
  
  for await (const event of stream) {
    events.push(event);
  }
  
  const tokenEvents = events.filter(e => e.type === 'token');
  const messageEvents = events.filter(e => e.type === 'assistant_message');
  
  expect(tokenEvents.length).toBeGreaterThan(0);
  expect(messageEvents).toHaveLength(1);
  
  const finalMessage = messageEvents[0].message;
  expect(finalMessage.content).toBeTruthy();
  
  console.log('Tokens received:', tokenEvents.length);
  console.log('Final message:', finalMessage.content);
}, { timeout: 45000 });